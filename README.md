# FinancialExtract - Next.js + FastAPI

A modern web application for extracting data from PDFs using AI, built with Next.js frontend and FastAPI backend.

## Tech Stack

### Frontend (Next.js)
- **Next.js 14** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Radix UI** - Component library
- **Firebase Auth** - Authentication
- **Stripe** - Payment processing
- **React Query** - Data fetching and caching

### Backend (FastAPI)
- **FastAPI** - Modern Python web framework
- **Firebase Admin SDK** - Authentication verification
- **Stripe** - Payment processing
- **Google Gemini AI** - PDF data extraction
- **Pydantic** - Data validation

## Getting Started

### Prerequisites
- Node.js 18+ 
- Python 3.8+
- Firebase project
- Stripe account
- Google Cloud account (for Gemini AI)

### Frontend Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment variables:
```bash
cp .env.example .env.local
```

3. Update `.env.local` with your Firebase and Stripe keys

4. Start the development server:
```bash
npm run dev
```

The frontend will be available at `http://localhost:3000`

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Create virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Copy environment variables:
```bash
cp .env.example .env
```

5. Update `.env` with your API keys

6. Start the FastAPI server:
```bash
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

### Running Both Services

You can run both frontend and backend simultaneously:

```bash
# Terminal 1 - Frontend
npm run dev

# Terminal 2 - Backend  
npm run backend
```

## Environment Variables

### Frontend (.env.local)
```
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_firebase_project_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_firebase_app_id
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Backend (backend/.env)
```
STRIPE_SECRET_KEY=your_stripe_secret_key
FIREBASE_SERVICE_ACCOUNT_PATH=path/to/service-account-key.json
GEMINI_API_KEY=your_gemini_api_key
```

## Project Structure

```
├── app/                    # Next.js App Router pages
├── components/             # React components
│   ├── ui/                # Reusable UI components
│   ├── layout/            # Layout components
│   └── pages/             # Page components
├── contexts/              # React contexts
├── lib/                   # Utility libraries
├── hooks/                 # Custom React hooks
├── backend/               # FastAPI backend
│   ├── routes/            # API routes
│   ├── main.py            # FastAPI app
│   └── requirements.txt   # Python dependencies
└── README.md
```

## Features

- **PDF Data Extraction**: Upload PDFs and extract structured data using AI
- **Custom Field Configuration**: Define field names, data types, and extraction prompts
- **Template Management**: Save and reuse extraction templates
- **User Authentication**: Firebase-based auth with Google sign-in
- **Subscription Management**: Stripe-powered billing and subscriptions
- **Responsive Design**: Works on desktop and mobile devices

## API Documentation

Once the backend is running, visit `http://localhost:8000/docs` for interactive API documentation.

## Deployment

### Frontend (Vercel)
1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy

### Backend (Railway/Heroku/DigitalOcean)
1. Set up your preferred hosting platform
2. Configure environment variables
3. Deploy the backend directory

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License