# Match-3 Backend

Backend API for the **Match-3 Browser Game**, created as part of the final project of the WBS Coding School Full Stack Web & App Development program.

The backend supports authentication, user data, campaign and game progression, leaderboard functionality and communication with the React/TypeScript frontend.

### [▶ Play the live game](https://match3-frontend.onrender.com/)

**Frontend repository:** https://github.com/jan-ninh/match3-frontend

---

## Tech Stack

- Node.js
- TypeScript
- Express
- MongoDB
- Mongoose
- Zod
- JSON Web Tokens
- bcrypt
- CORS
- cookie-based authentication flow

---

## API Responsibilities

The backend provides endpoints for several parts of the application:

- user registration, login and logout
- user profiles and avatars
- gameplay power data
- campaign start, completion and abort flows
- game stage progression and status
- leaderboard rankings
- health checks

Request data and route parameters are validated with **Zod**.

The application uses **MongoDB with Mongoose** for persistence and communicates with the separately deployed frontend through an Express API.

---

## Project Structure

The backend separates responsibilities into dedicated areas for:

- routes
- controllers
- services
- models
- schemas
- middleware
- configuration
- utilities

This keeps routing, validation, application logic and persistence concerns separated as the application grows.

---

## My Contribution

This backend was part of a **two-person final project**.

The backend implementation was primarily handled by my project partner. My own focus was the frontend and gameplay systems.

I worked with the backend mainly through:

- frontend/backend integration
- reviewing the implementation
- debugging communication between both applications
- making targeted corrections where necessary
- configuring the frontend for different API environments
- supporting deployment and production integration

For the main project documentation and a detailed overview of my contribution, see the frontend repository:

https://github.com/jan-ninh/match3-frontend

---

## Running Locally

Clone the repository and install the dependencies:

```bash
git clone https://github.com/jan-ninh/match3-backend.git
cd match3-backend
npm install
```

Create a local `.env` file based on the included `.env.example`.

The backend requires environment configuration including a MongoDB connection and authentication settings.

Then start the development server:

```bash
npm run dev
```

The frontend is maintained in a separate repository:

https://github.com/jan-ninh/match3-frontend
