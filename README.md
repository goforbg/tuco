# Tuco AI - Lead Management Platform

A modern B2B SaaS lead management platform built with Next.js, MongoDB, and Clerk authentication.

## Features

- **Authentication**: Secure user authentication with Clerk
- **Lead Import**: CSV file upload with field mapping
- **Dashboard**: Clean, modern interface matching Firecrawl design
- **Mobile Responsive**: Fully responsive design for all devices
- **Database**: MongoDB integration for data persistence

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS
- **Authentication**: Clerk
- **Database**: MongoDB with Mongoose
- **Icons**: Lucide React
- **CSV Processing**: PapaParse

## Getting Started

### Prerequisites

- Node.js 18+ 
- MongoDB database
- Clerk account

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd app
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env.local` file in the root directory:

```bash
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_publishable_key_here
CLERK_SECRET_KEY=your_secret_key_here

# MongoDB
MONGODB_URI=your_mongodb_connection_string_here

# Next.js
NEXTAUTH_URL=http://localhost:3000
```

4. Get your Clerk keys:
   - Sign up at [clerk.com](https://clerk.com)
   - Create a new application
   - Copy your Publishable Key and Secret Key from the API Keys page

5. Set up MongoDB:
   - Create a MongoDB database (local or cloud)
   - Get your connection string
   - Add it to your `.env.local` file

6. Run the development server:
```bash
npm run dev
```

7. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   ├── leads/             # Leads page
│   ├── sign-in/           # Authentication pages
│   ├── sign-up/
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page
├── components/            # React components
│   ├── DashboardLayout.tsx
│   ├── Sidebar.tsx
│   └── TopBar.tsx
├── lib/                   # Utility functions
│   └── mongodb.ts         # Database connection
├── models/                # Database models
│   └── Lead.ts            # Lead schema
└── types/                 # TypeScript types
    └── global.d.ts
```

## Features Overview

### Authentication
- Secure sign-in/sign-up with Clerk
- Custom UI matching Firecrawl design
- Protected routes and API endpoints

### Lead Management
- CSV file upload with drag-and-drop
- Field mapping interface
- Data preview before saving
- Integration placeholders for HubSpot/Salesforce

### Dashboard
- Overview with statistics cards
- Responsive sidebar navigation
- Mobile-friendly design
- Clean, modern UI with #FF3515 primary color

## API Endpoints

- `POST /api/leads` - Create new leads
- `GET /api/leads` - Fetch user's leads

## Deployment

The app is ready for deployment on Vercel, Netlify, or any other Next.js hosting platform.

1. Push your code to GitHub
2. Connect your repository to your hosting platform
3. Add environment variables in your hosting platform's dashboard
4. Deploy!

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is licensed under the MIT License.