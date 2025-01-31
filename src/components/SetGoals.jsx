import React, { useState, useEffect } from 'react';
import Confetti from 'react-confetti';
import { gapi } from 'gapi-script';

const CLIENT_ID = "71468948550-8o8vg6pic2kbhrk8ik98pu2srittqkvm.apps.googleusercontent.com";
const API_KEY = "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";
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"];
const SCOPES = "https://www.googleapis.com/auth/calendar.events";

const SetGoals = () => {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        name: '',
        targetAmount: '',
        startDate: new Date().toISOString().split('T')[0],
        targetDate: '',
        description: '',
        priority: '0',
    });
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        function start() {
            gapi.client.init({
                apiKey: API_KEY,
                clientId: CLIENT_ID,
                discoveryDocs: DISCOVERY_DOCS,
                scope: SCOPES,
            });
        }
        gapi.load("client:auth2", start);
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleAuth = async () => {
        try {
            console.log("Redirect URI:", window.location.origin);
            await gapi.auth2.getAuthInstance().signIn();
            return true;
        } catch (error) {
            console.error("Google Auth Error:", error);
            return false;
        }
    };

    const createCalendarEvents = () => {
        const startDate = new Date(formData.startDate);
        const targetDate = new Date(formData.targetDate);

        while (startDate <= targetDate) {
            let event = {
                summary: `Goal Reminder: ${formData.name}`,
                description: formData.description,
                start: {
                    dateTime: new Date(startDate.setHours(8, 0, 0)).toISOString(),
                    timeZone: "UTC",
                },
                end: {
                    dateTime: new Date(startDate.setHours(9, 0, 0)).toISOString(),
                    timeZone: "UTC",
                },
            };

            gapi.client.calendar.events.insert({
                calendarId: "primary",
                resource: event,
            }).then((response) => {
                console.log("Event Created:", response);
            }).catch((error) => console.log("Error:", error));

            startDate.setDate(startDate.getDate() + 1);
        }
    };

    const handleSubmit = async () => {
        try {
            const token = localStorage.getItem('token');
            const userId = localStorage.getItem('userId');

            const response = await fetch('http://localhost:5001/api/savings-goals', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({...formData, userId})
            });

            if (!response.ok) {
                throw new Error('Failed to save goal');
            }

            const authSuccess = await handleAuth();
            if (authSuccess) {
                createCalendarEvents();
                alert("Goal reminders added to Google Calendar!");
            }

            setFormData({
                name: '',
                targetAmount: '',
                startDate: new Date().toISOString().split('T')[0],
                targetDate: '',
                description: '',
                priority: '0',
            });
            setSuccess(true);
            setStep(1);
            setTimeout(() => setSuccess(false), 5000);
        } catch (error) {
            console.error('Error saving goal:', error);
        }
    };

    const renderStepContent = () => {
        switch (step) {
            case 1:
                return (
                    <div className="content">
                        <h2>What is your goal?</h2>
                        <input type="text" name="name" placeholder="Goal Name" value={formData.name} onChange={handleChange} />
                        <button onClick={() => setStep(2)}>Next</button>
                    </div>
                );
            case 2:
                return (
                    <div className="content">
                        <h2>Set your target amount</h2>
                        <input type="number" name="targetAmount" placeholder="Target Amount" value={formData.targetAmount} onChange={handleChange} />
                        <button onClick={() => setStep(1)}>Back</button>
                        <button onClick={() => setStep(3)}>Next</button>
                    </div>
                );
            case 3:
                return (
                    <div className="content">
                        <h2>Pick a date</h2>
                        <input type="date" name="startDate" value={formData.startDate} onChange={handleChange} />
                        <input type="date" name="targetDate" value={formData.targetDate} onChange={handleChange} />
                        <button onClick={() => setStep(2)}>Back</button>
                        <button onClick={() => setStep(4)}>Next</button>
                    </div>
                );
            case 4:
                return (
                    <div className="content">
                        <h2>Describe your goal</h2>
                        <textarea name="description" placeholder="Description" value={formData.description} onChange={handleChange} />
                        <button onClick={() => setStep(3)}>Back</button>
                        <button onClick={handleSubmit}>Finish</button>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="set-goals">
            {success && <Confetti />}
            <div className="step">{renderStepContent()}</div>
        </div>
    );
};

export default SetGoals;