// server/index.js
// const express = require('express');
import express from "express";
import mysql from 'mysql2';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Create database connection
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
});

// Connect to database
db.connect(err => {
    if (err) {
        console.error('Error connecting to the database:', err);
        return;
    }
    console.log('Connected to database!');
});

// Create MailerSend SMTP transporter
const transporter = nodemailer.createTransport({
  host: 'smtp.mailersend.net',
  port: 587,
  secure: false,
  auth: {
      user: 'MS_Lm0GF8@trial-ynrw7gy5ojr42k8e.mlsender.net',
      pass: ''
  }
});

// Store reset codes temporarily (in production, use Redis or similar)
const resetCodes = new Map();
// Registration endpoint
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password, firstName, lastName } = req.body;
        
        // Check if user already exists
        db.query('SELECT * FROM Users WHERE email = ?', [email], async (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (results.length > 0) {
                return res.status(400).json({ error: 'Email already registered' });
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Insert new user
            const userData = {
                Username: username,
                Email: email,
                Password: hashedPassword,
                FirstName: firstName,
                LastName: lastName,
                StatusID: 1 // Assuming 1 is the StatusID for active users
            };

            db.query('INSERT INTO Users SET ?', userData, (err, result) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ error: 'Error creating user' });
                }

                // Create JWT token
                const token = jwt.sign(
                    { userId: result.insertId, email },
                    process.env.JWT_SECRET,
                    { expiresIn: '24h' }
                );

                res.status(201).json({
                    message: 'User registered successfully',
                    token,
                    userId: result.insertId
                });
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        db.query(
            'SELECT UserID, Password, Username, FirstName, LastName FROM Users WHERE Email = ?',
            [email],
            async (err, results) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ error: 'Database error' });
                }

                if (results.length === 0) {
                    return res.status(401).json({ error: 'Invalid credentials' });
                }

                const user = results[0];
                const validPassword = await bcrypt.compare(password, user.Password);

                if (!validPassword) {
                    return res.status(401).json({ error: 'Invalid credentials' });
                }

                // Create JWT token
                const token = jwt.sign(
                    { userId: user.UserID, email },
                    process.env.JWT_SECRET,
                    { expiresIn: '24h' }
                );

                // Update last login
                db.query('UPDATE Users SET LastLoginAt = CURRENT_TIMESTAMP WHERE UserID = ?', [user.UserID]);

                res.json({
                    token,
                    user: {
                        id: user.UserID,
                        username: user.Username,
                        firstName: user.FirstName,
                        lastName: user.LastName
                    }
                });
            }
        );
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Protected route to get user data
app.get('/api/user/:id', verifyToken, (req, res) => {
    const userId = req.params.id;
    
    db.query(
        'SELECT UserID, Username, Email, FirstName, LastName, PreferredCurrency, TimeZone FROM Users WHERE UserID = ?',
        [userId],
        (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Database error' });
            }

            if (results.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json(results[0]);
        }
    );
});

// Middleware to verify JWT token
function verifyToken(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];
    
    if (!token) {
        return res.status(403).json({ error: 'No token provided' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        req.user = decoded;
        next();
    });
}

const PORT = process.env.SERVER_PORT || 5001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Add these routes to your server/index.js

// Get income categories
app.get('/api/categories', verifyToken, (req, res) => {
  const type = req.query.type;
  const query = 'SELECT * FROM Categories WHERE Type = ?';
  
  db.query(query, [type], (err, results) => {
    if (err) {
      console.error('Error fetching categories:', err);
      return res.status(500).json({ error: 'Failed to fetch categories' });
    }
    res.json(results);
  });
});

// Get payment methods
app.get('/api/payment-methods', verifyToken, (req, res) => {
  const query = 'SELECT * FROM PaymentMethods WHERE IsActive = true';
  
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching payment methods:', err);
      return res.status(500).json({ error: 'Failed to fetch payment methods' });
    }
    res.json(results);
  });
});

// Add new income
app.post('/api/income', verifyToken, (req, res) => {
  const {
    userId,
    categoryId,
    amount,
    currency,
    paymentMethodId,
    transactionDate,
    description,
    isRecurring,
    recurrenceInterval
  } = req.body;

  const income = {
    UserID: userId,
    CategoryID: categoryId,
    Amount: amount,
    Currency: currency,
    PaymentMethodID: paymentMethodId,
    TransactionDate: transactionDate,
    Description: description,
    IsRecurring: isRecurring,
    RecurrenceInterval: recurrenceInterval
  };

  db.query('INSERT INTO Income SET ?', income, (err, result) => {
    if (err) {
      console.error('Error adding income:', err);
      return res.status(500).json({ error: 'Failed to add income' });
    }

    res.status(201).json({
      message: 'Income added successfully',
      incomeId: result.insertId
    });
  });
});

// Add new expense
app.post('/api/expense', verifyToken, (req, res) => {
    const {
      userId,
      categoryId,
      amount,
      currency,
      paymentMethodId,
      transactionDate,
      description,
      isRecurring,
      recurrenceInterval,
      receiptURL
    } = req.body;
  
    const expense = {
      UserID: userId,
      CategoryID: categoryId,
      Amount: amount,
      Currency: currency,
      PaymentMethodID: paymentMethodId,
      TransactionDate: transactionDate,
      Description: description,
      IsRecurring: isRecurring ? 1 : 0,
      RecurrenceInterval: recurrenceInterval,
      ReceiptURL: receiptURL
    };
  
    db.query('INSERT INTO Expense SET ?', expense, (err, result) => {
      if (err) {
        console.error('Error adding expense:', err);
        return res.status(500).json({ error: 'Failed to add expense' });
      }
  
      res.status(201).json({
        message: 'Expense added successfully',
        expenseId: result.insertId
      });
    });
  });

  // Fetch all income records for a user
app.get('/api/income', verifyToken, (req, res) => {
    // Log the entire request details
    console.log('Income Fetch Request Details:', {
      user: req.user,
      headers: req.headers
    });
  
    const userId = req.user.userId;
    
    console.log('Fetching income for UserID:', userId);
  
    const query = `
      SELECT 
        i.IncomeID, 
        i.Amount, 
        i.Currency, 
        i.TransactionDate, 
        i.Description, 
        i.IsRecurring,
        i.RecurrenceInterval,
        c.Name AS CategoryName,
        p.Name AS PaymentMethodName
      FROM Income i
      LEFT JOIN Categories c ON i.CategoryID = c.CategoryID
      LEFT JOIN PaymentMethods p ON i.PaymentMethodID = p.PaymentMethodID
      WHERE i.UserID = ?
      ORDER BY i.TransactionDate DESC
    `;
  
    db.query(query, [userId], (err, results) => {
      if (err) {
        console.error('Database Error fetching income records:', err);
        return res.status(500).json({ 
          error: 'Failed to fetch income records', 
          details: err.message 
        });
      }
      
      console.log('Income records found:', results.length);
      res.status(200).json(results);
    });
  });
  




// function generateId(length = 5) {
//     const chars = '0123456789';
//     let id = '';
//     for (let i = 0; i < length; i++) {
//         id += chars.charAt(Math.floor(Math.random() * chars.length));
//     }
//     return +id;
// }

//savings goal
// Helper function to calculate actual savings for a period
const calculateSavingsForPeriod = async (userId, startDate, endDate) => {
  const query = `
      SELECT 
          (SELECT COALESCE(SUM(Amount), 0)
           FROM Income 
           WHERE UserID = ? 
           AND TransactionDate BETWEEN ? AND ?) as totalIncome,
          (SELECT COALESCE(SUM(Amount), 0)
           FROM Expense 
           WHERE UserID = ? 
           AND TransactionDate BETWEEN ? AND ?) as totalExpense
  `;

  return new Promise((resolve, reject) => {
      db.query(
          query, 
          [userId, startDate, endDate, userId, startDate, endDate],
          (err, results) => {
              if (err) {
                  reject(err);
                  return;
              }
              const totalIncome = results[0].totalIncome;
              const totalExpense = results[0].totalExpense;
              const actualSavings = totalIncome - totalExpense;
              resolve({ actualSavings, totalIncome, totalExpense });
          }
      );
  });
};

// Create new savings goal
app.post('/api/savings-goals', verifyToken, async (req, res) => {
  try {
      const {
          userId,
          name,
          targetAmount,
          startDate,
          targetDate,
          description,
          priority,
          currency = 'USD'
      } = req.body;

      // Calculate actual savings for the period
      const { actualSavings, totalIncome, totalExpense } = await calculateSavingsForPeriod(
          userId,
          startDate,
          targetDate
      );

      // Calculate progress percentage
      const progressPercentage = (actualSavings / targetAmount) * 100;

      const goal = {
          UserID: userId,
          Name: name,
          TargetAmount: targetAmount,
          CurrentAmount: actualSavings,
          Currency: currency,
          StartDate: startDate,
          TargetDate: targetDate,
          Priority: priority,
          Status: actualSavings >= targetAmount ? 'COMPLETED' : 'ACTIVE',
          Description: description
      };

      db.query('INSERT INTO SavingsGoals SET ?', goal, (err, result) => {
          if (err) {
              console.error('Error creating savings goal:', err);
              return res.status(500).json({ error: 'Failed to create savings goal' });
          }

          res.status(201).json({
              message: 'Savings goal created successfully',
              goalId: result.insertId,
              actualSavings,
              totalIncome,
              totalExpense,
              progressPercentage
          });
      });
  } catch (error) {
      console.error('Error in goal creation:', error);
      res.status(500).json({ error: 'Server error' });
  }
});

// Get user's savings goals
app.get('/api/savings-goals/:userId', verifyToken, async (req, res) => {
  try {
      const userId = req.params.userId;
      
      const query = `
          SELECT * FROM SavingsGoals 
          WHERE UserID = ? 
          ORDER BY CreatedAt DESC`;
      
      db.query(query, [userId], async (err, goals) => {
          if (err) {
              console.error('Error fetching savings goals:', err);
              return res.status(500).json({ error: 'Failed to fetch goals' });
          }

          // Calculate current progress for each goal
          const updatedGoals = await Promise.all(goals.map(async (goal) => {
              const { actualSavings, totalIncome, totalExpense } = await calculateSavingsForPeriod(
                  userId,
                  goal.StartDate,
                  goal.TargetDate
              );

              const progressPercentage = (actualSavings / goal.TargetAmount) * 100;

              return {
                  ...goal,
                  CurrentAmount: actualSavings,
                  Status: actualSavings >= goal.TargetAmount ? 'COMPLETED' : 'ACTIVE',
                  progressPercentage,
                  periodDetails: {
                      totalIncome,
                      totalExpense,
                      actualSavings
                  }
              };
          }));

          res.json(updatedGoals);
      });
  } catch (error) {
      console.error('Error processing goals:', error);
      res.status(500).json({ error: 'Server error' });
  }
});
// 

// Fetch all expense records for a user
app.get('/api/expense', verifyToken, (req, res) => {
  const userId = req.user.userId;
  
  const query = `
    SELECT 
      e.ExpenseID, 
      e.Amount, 
      e.Currency, 
      e.TransactionDate, 
      e.Description, 
      e.IsRecurring,
      e.RecurrenceInterval,
      e.ReceiptURL,
      c.Name AS CategoryName,
      p.Name AS PaymentMethodName
    FROM Expense e
    LEFT JOIN Categories c ON e.CategoryID = c.CategoryID
    LEFT JOIN PaymentMethods p ON e.PaymentMethodID = p.PaymentMethodID
    WHERE e.UserID = ?
    ORDER BY e.TransactionDate DESC
  `;

  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Database Error fetching expense records:', err);
      return res.status(500).json({ 
        error: 'Failed to fetch expense records', 
        details: err.message 
      });
    }
    
    res.status(200).json(results);
  });
});

// Monthly Income endpoint
app.get('/api/income/monthly', verifyToken, (req, res) => {
  const userId = req.user.userId;
  const { year, month } = req.query;
  
  // Create date range for the selected month
  const firstDay = new Date(year, month, 1).toISOString().slice(0, 10);
  const lastDay = new Date(year, parseInt(month) + 1, 0).toISOString().slice(0, 10);

  const query = `
    SELECT COALESCE(SUM(Amount), 0) as totalIncome
    FROM Income
    WHERE UserID = ?
    AND DATE(TransactionDate) >= ?
    AND DATE(TransactionDate) <= ?
  `;

  db.query(query, [userId, firstDay, lastDay], (err, results) => {
    if (err) {
      console.error('Error fetching monthly income:', err);
      return res.status(500).json({ error: 'Failed to fetch monthly income' });
    }

    res.json({ totalIncome: results[0].totalIncome });
  });
});

// Monthly Expenses endpoint
app.get('/api/expense/monthly', verifyToken, (req, res) => {
  const userId = req.user.userId;
  const { year, month } = req.query;
  
  // Create date range for the selected month
  const firstDay = new Date(year, month, 1).toISOString().slice(0, 10);
  const lastDay = new Date(year, parseInt(month) + 1, 0).toISOString().slice(0, 10);

  const query = `
    SELECT COALESCE(SUM(Amount), 0) as totalExpense
    FROM Expense
    WHERE UserID = ?
    AND DATE(TransactionDate) >= ?
    AND DATE(TransactionDate) <= ?
  `;

  db.query(query, [userId, firstDay, lastDay], (err, results) => {
    if (err) {
      console.error('Error fetching monthly expenses:', err);
      return res.status(500).json({ error: 'Failed to fetch monthly expenses' });
    }

    res.json({ totalExpense: results[0].totalExpense });
  });
});
// הוצאות - API כולל תיקון
app.get('/api/expense/total', verifyToken, (req, res) => {
  const userId = req.user.userId;

  const query = `
    SELECT COALESCE(SUM(Amount), 0) as totalExpense
    FROM Expense
    WHERE UserID = ?
  `;

  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Error fetching total expenses:', err);
      return res.status(500).json({ error: 'Failed to fetch total expenses' });
    }

    // החזרת סכום ב-JSON בצורה תקינה
    res.json({ totalExpense: results[0].totalExpense });
  });
});

// הכנסות - API כולל תיקון
app.get('/api/income/total', verifyToken, (req, res) => {
  const userId = req.user.userId;

  const query = `
    SELECT COALESCE(SUM(Amount), 0) as totalIncome
    FROM Income
    WHERE UserID = ?
  `;

  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Error fetching total income:', err);
      return res.status(500).json({ error: 'Failed to fetch total income' });
    }

    // החזרת סכום ב-JSON בצורה תקינה
    res.json({ totalIncome: results[0].totalIncome });
  });
});
// Add these endpoints to your server code

// Update savings goal
app.put('/api/savings-goals/:goalId', verifyToken, async (req, res) => {
  try {
    const goalId = req.params.goalId;
    const {
      UserID,
      Name,
      TargetAmount,
      StartDate,
      TargetDate,
      Description
    } = req.body;

    // First verify that the goal belongs to the user
    const verifyQuery = 'SELECT * FROM SavingsGoals WHERE GoalID = ? AND UserID = ?';
    db.query(verifyQuery, [goalId, UserID], async (verifyErr, verifyResults) => {
      if (verifyErr) {
        console.error('Error verifying goal ownership:', verifyErr);
        return res.status(500).json({ error: 'Failed to verify goal ownership' });
      }

      if (verifyResults.length === 0) {
        return res.status(403).json({ error: 'Unauthorized to modify this goal' });
      }

      // Calculate new savings amount
      const { actualSavings } = await calculateSavingsForPeriod(
        UserID,
        StartDate,
        TargetDate
      );

      const updateQuery = `
        UPDATE SavingsGoals 
        SET 
          Name = ?,
          TargetAmount = ?,
          CurrentAmount = ?,
          StartDate = ?,
          TargetDate = ?,
          Description = ?,
          Status = ?,
          UpdatedAt = CURRENT_TIMESTAMP
        WHERE GoalID = ? AND UserID = ?
      `;

      const status = actualSavings >= TargetAmount ? 'COMPLETED' : 'ACTIVE';

      db.query(
        updateQuery,
        [
          Name,
          TargetAmount,
          actualSavings,
          StartDate,
          TargetDate,
          Description,
          status,
          goalId,
          UserID
        ],
        (updateErr, updateResult) => {
          if (updateErr) {
            console.error('Error updating goal:', updateErr);
            return res.status(500).json({ error: 'Failed to update goal' });
          }

          res.json({ 
            message: 'Goal updated successfully',
            actualSavings,
            status
          });
        }
      );
    });
  } catch (error) {
    console.error('Error in goal update:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete savings goal
app.delete('/api/savings-goals/:goalId', verifyToken, (req, res) => {
  try {
    const goalId = req.params.goalId;
    const userId = req.user.userId; // Get userId from the verified token

    // First verify that the goal belongs to the user
    const verifyQuery = 'SELECT * FROM SavingsGoals WHERE GoalID = ? AND UserID = ?';
    db.query(verifyQuery, [goalId, userId], (verifyErr, verifyResults) => {
      if (verifyErr) {
        console.error('Error verifying goal ownership:', verifyErr);
        return res.status(500).json({ error: 'Failed to verify goal ownership' });
      }

      if (verifyResults.length === 0) {
        return res.status(403).json({ error: 'Unauthorized to delete this goal' });
      }

      // Proceed with deletion
      const deleteQuery = 'DELETE FROM SavingsGoals WHERE GoalID = ? AND UserID = ?';
      db.query(deleteQuery, [goalId, userId], (deleteErr, deleteResult) => {
        if (deleteErr) {
          console.error('Error deleting goal:', deleteErr);
          return res.status(500).json({ error: 'Failed to delete goal' });
        }

        res.json({ message: 'Goal deleted successfully' });
      });
    });
  } catch (error) {
    console.error('Error in goal deletion:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/////
// Create new budget
app.post('/api/budgets', verifyToken, async (req, res) => {
  try {
      const {
          userId,
          categoryId,
          amount,
          currency,
          startDate,
          endDate,
          rolloverUnused,
          alertThreshold
      } = req.body;

      const budget = {
          UserID: userId,
          CategoryID: categoryId,
          Amount: amount,
          Currency: currency,
          StartDate: startDate,
          EndDate: endDate,
          RolloverUnused: rolloverUnused ? 1 : 0,
          AlertThreshold: alertThreshold,
          CreatedAt: new Date(),
          UpdatedAt: new Date()
      };

      db.query('INSERT INTO Budgets SET ?', budget, (err, result) => {
          if (err) {
              console.error('Error creating budget:', err);
              return res.status(500).json({ error: 'Failed to create budget' });
          }

          res.status(201).json({
              message: 'Budget created successfully',
              budgetId: result.insertId
          });
      });
  } catch (error) {
      console.error('Error in budget creation:', error);
      res.status(500).json({ error: 'Server error' });
  }
});

// Get user's budgets with spending progress
app.get('/api/budgets/:userId', verifyToken, (req, res) => {
  const userId = req.params.userId;
  
  const query = `
      SELECT 
          b.*,
          c.Name as CategoryName,
          COALESCE(SUM(e.Amount), 0) as SpentAmount,
          (
              SELECT COUNT(DISTINCT DATE(e2.TransactionDate))
              FROM Expense e2
              WHERE e2.UserID = b.UserID
              AND e2.CategoryID = b.CategoryID
              AND e2.TransactionDate BETWEEN b.StartDate AND b.EndDate
          ) as DaysWithExpenses,
          DATEDIFF(b.EndDate, CURDATE()) as DaysRemaining,
          DATEDIFF(b.EndDate, b.StartDate) + 1 as TotalDays
      FROM Budgets b
      LEFT JOIN Categories c ON b.CategoryID = c.CategoryID
      LEFT JOIN Expense e ON e.UserID = b.UserID 
          AND e.CategoryID = b.CategoryID
          AND e.TransactionDate BETWEEN b.StartDate AND b.EndDate
      WHERE b.UserID = ?
      GROUP BY b.BudgetID
      ORDER BY b.CreatedAt DESC
  `;

  db.query(query, [userId], (err, results) => {
      if (err) {
          console.error('Error fetching budgets:', err);
          return res.status(500).json({ error: 'Failed to fetch budgets' });
      }

      // Calculate additional metrics for each budget
      const budgetsWithMetrics = results.map(budget => {
          const spentPercentage = (budget.SpentAmount / budget.Amount) * 100;
          const dailyBudget = budget.Amount / budget.TotalDays;
          const expectedSpending = (budget.TotalDays - budget.DaysRemaining) * dailyBudget;

          return {
              ...budget,
              spentPercentage,
              dailyBudget,
              expectedSpending,
              isOverBudget: budget.SpentAmount > budget.Amount,
              needsAlert: spentPercentage >= budget.AlertThreshold
          };
      });

      res.json(budgetsWithMetrics);
  });
});
///



// Generate reset code endpoint
app.post('/api/forgot-password', async (req, res) => {
  try {
      const { email } = req.body;

      // Check if user exists
      db.query('SELECT UserID FROM Users WHERE Email = ?', [email], async (err, results) => {
          if (err) {
              console.error(err);
              return res.status(500).json({ error: 'Database error' });
          }

          if (results.length === 0) {
              return res.status(404).json({ error: 'User not found' });
          }

          // Generate random 4-digit code
          const resetCode = Math.floor(1000 + Math.random() * 9000).toString();
          
          // Store code with email and timestamp
          resetCodes.set(email, {
              code: resetCode,
              timestamp: Date.now(),
              userId: results[0].UserID
          });

          try {
              // Send email using MailerSend SMTP
              await transporter.sendMail({
                  from: 'FinTrack <noreply@trial-ynrw7gy5ojr42k8e.mlsender.net>',
                  to: email,
                  subject: 'Password Reset Code',
                  html: `
                      <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
                          <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                              <h2 style="color: #333; text-align: center;">Password Reset Request</h2>
                              <p>Hello,</p>
                              <p>You have requested to reset your password for your FinTrack account. Here is your verification code:</p>
                              <div style="text-align: center; padding: 20px;">
                                  <h1 style="color: #4A90E2; font-size: 32px; letter-spacing: 5px; background-color: #f8f9fa; padding: 10px; border-radius: 5px;">${resetCode}</h1>
                              </div>
                              <p>This code will expire in 15 minutes.</p>
                              <p>If you didn't request this reset, please ignore this email.</p>
                              <hr style="border: 1px solid #eee; margin: 20px 0;">
                              <p style="color: #666; font-size: 12px; text-align: center;">This is an automated message from FinTrack. Please do not reply to this email.</p>
                          </div>
                      </div>
                  `
              });

              res.json({ message: 'Reset code sent successfully' });
          } catch (emailError) {
              console.error('Error sending email:', emailError);
              res.status(500).json({ 
                  error: 'Failed to send reset code',
                  details: emailError.message
              });
          }
      });
  } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Server error' });
  }
});

// Verify reset code endpoint (remains the same)
app.post('/api/verify-reset-code', (req, res) => {
  const { email, code } = req.body;
  const resetData = resetCodes.get(email);

  if (!resetData) {
      return res.status(400).json({ error: 'No reset code found' });
  }

  // Check if code is expired (15 minutes)
  if (Date.now() - resetData.timestamp > 15 * 60 * 1000) {
      resetCodes.delete(email);
      return res.status(400).json({ error: 'Reset code expired' });
  }

  if (resetData.code !== code) {
      return res.status(400).json({ error: 'Invalid reset code' });
  }

  res.json({ 
      message: 'Code verified successfully',
      userId: resetData.userId
  });
});

// Reset password endpoint
app.post('/api/reset-password', async (req, res) => {
  try {
      const { email, newPassword } = req.body;
      const resetData = resetCodes.get(email);

      if (!resetData) {
          return res.status(400).json({ error: 'Invalid reset request' });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update password in database
      db.query(
          'UPDATE Users SET Password = ? WHERE Email = ?',
          [hashedPassword, email],
          async (err, result) => {
              if (err) {
                  console.error(err);
                  return res.status(500).json({ error: 'Failed to update password' });
              }

              // Clear reset code
              resetCodes.delete(email);

              try {
                  // Send confirmation email
                  await transporter.sendMail({
                      from: 'FinTrack <noreply@trial-ynrw7gy5ojr42k8e.mlsender.net>',
                      to: email,
                      subject: 'Password Reset Successful',
                      html: `
                          <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
                              <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                                  <h2 style="color: #333; text-align: center;">Password Reset Successful</h2>
                                  <p>Hello,</p>
                                  <p>Your FinTrack account password has been successfully reset.</p>
                                  <p>If you did not make this change, please contact our support team immediately.</p>
                                  <hr style="border: 1px solid #eee; margin: 20px 0;">
                                  <p style="color: #666; font-size: 12px; text-align: center;">This is an automated message from FinTrack. Please do not reply to this email.</p>
                              </div>
                          </div>
                      `
                  });
              } catch (emailError) {
                  console.error('Error sending confirmation email:', emailError);
              }

              res.json({ message: 'Password updated successfully' });
          }
      );
  } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Server error' });
  }
});
///
