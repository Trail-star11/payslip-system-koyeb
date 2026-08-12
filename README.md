# Payslip Download System

## Overview
A multi-device payslip system that allows employees to download their payslips securely.

## Features
- 🔐 Admin panel to upload CSV and PDF files
- 📄 Automatic PDF page detection using Employee ID
- 📥 Employee self-service download
- 🔬 Test mode for easy testing
- 📊 Download tracking

## Tech Stack
- **Backend:** Node.js + Express
- **Database:** MongoDB Atlas
- **Storage:** MongoDB GridFS
- **Deployment:** Koyeb

## Environment Variables
| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3000) |
| `MONGODB_URI` | MongoDB connection string |
| `DB_NAME` | Database name |
| `ADMIN_PASSWORD` | Admin panel password |

## Deployment
Deployed on Koyeb. Auto-deploys on git push.

## URL
https://your-app.koyeb.app
