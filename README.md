# ByteReview - AI-Powered Document Data Extraction

A modern web application for extracting structured data from PDFs using AI. Upload documents, define custom fields, and let AI extract the data you need. Built with Next.js frontend and FastAPI backend.

## Tech Stack

### Frontend (Next.js)

- **Next.js 14+** - React framework with App Router
- **TypeScript** - Type safety with OpenAPI-generated types
- **Tailwind CSS** - Styling
- **Radix UI** - Component library
- **Firebase Auth** - Authentication
- **Stripe** - Payment processing

### Backend (FastAPI)

- **FastAPI** - Modern Python web framework
- **PostgreSQL** - Primary database
- **Redis** - Background job queue and caching
- **ARQ** - Async task queue for background processing
- **Firebase Admin SDK** - Authentication verification
- **Google Cloud Storage** - File storage
- **Google Gemini AI** - PDF data extraction
- **Stripe** - Payment processing

## Getting Started

### Prerequisites

- **Node.js 18+**
- **Python 3.9+**
- **Docker & Docker Compose** (recommended for local development)
- **PostgreSQL** (or use Docker)
- **Redis** (or use Docker)
- **Firebase project** with Authentication enabled
- **Google Cloud account** with:
  - Cloud Storage bucket
  - Gemini AI API access
  - Service account with appropriate permissions
- **Stripe account** for payment processing

### Quick Start with Docker (Recommended)

1. **Clone the repository:**

```bash
git clone <repository-url>
cd bytereview
```

2. **Start all services with Docker:**

```bash
docker-compose up -d
```

This will start:

- PostgreSQL database (port 5432)
- Redis (port 6379)
- Backend API (port 8000)

3. **Install frontend dependencies:**

```bash
npm install
```

4. **Set up environment variables in `env.local` and `backend/.env`.**

5. **Start the frontend:**

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

### Manual Setup (Alternative)

#### Backend Setup

1. **Install PostgreSQL and Redis** (or use Docker for just these services)

2. **Navigate to backend directory:**

```bash
cd backend
```

3. **Create virtual environment:**

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

4. **Install dependencies:**

```bash
pip install -r requirements.txt
```

5. **Set up environment variables in `backend/.env`.**

6. **Run database migrations:**

```bash
alembic upgrade head
```

7. **Start the background workers:**

```bash
# Terminal 1 - AI extraction worker
python workers/run_workers.py ai

# Terminal 2 - ZIP extraction worker
python workers/run_workers.py zip
```

8. **Start the FastAPI server:**

```bash
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

#### Frontend Setup

1. **Install dependencies:**

```bash
npm install
```

2. **Set up environment variables in `.env.local`.**

````

3. **Generate TypeScript types from OpenAPI:**

```bash
npm run generate-types
````

4. **Start the development server:**

```bash
npm run dev
```

## Environment Variables

### Frontend (.env.local)

```bash
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_firebase_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_firebase_app_id

# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:8000

# Stripe Configuration
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key
```

### Backend (backend/.env)

```bash
# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/bytereview
REDIS_URL=redis://localhost:6379

# Firebase Configuration
FIREBASE_SERVICE_ACCOUNT_PATH=path/to/service-account-key.json

# Google Cloud Configuration
GOOGLE_CLOUD_PROJECT=your_gcp_project_id
GOOGLE_CLOUD_STORAGE_BUCKET=your_storage_bucket
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account-key.json

# AI Configuration
GEMINI_API_KEY=your_gemini_api_key

# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Application Configuration
ENVIRONMENT=development
LOG_LEVEL=INFO
```

## Project Structure

```
├── app/                    # Next.js App Router pages
│   ├── dashboard/         # Dashboard pages (jobs, settings)
│   ├── about/             # Marketing pages
│   └── layout.tsx         # Root layout
├── components/             # React components
│   ├── ui/                # Reusable UI components
│   ├── layout/            # Layout components
│   ├── workflow/          # Job workflow components
│   ├── upload/            # File upload components
│   ├── extraction/        # Data extraction components
│   └── pages/             # Page-specific components
├── contexts/              # React contexts (Auth)
├── lib/                   # Utility libraries
│   ├── api.ts             # API client with typed endpoints
│   ├── api-types.ts       # Generated OpenAPI types
│   └── firebase.ts       # Firebase configuration
├── hooks/                 # Custom React hooks
├── backend/               # FastAPI backend
│   ├── routes/            # API route handlers
│   ├── services/          # Business logic services
│   ├── models/            # Pydantic models & database models
│   ├── workers/           # Background job workers
│   ├── core/              # Core utilities (database, etc.)
│   ├── dependencies/      # FastAPI dependencies
│   ├── alembic/           # Database migrations
│   └── main.py            # FastAPI application
├── docker-compose.yml     # Local development services
└── README.md
```

## Features

### Core Functionality

- **Multi-Step Job Workflow**: Upload → Configure → Process → Review Results
- **AI-Powered Extraction**: Uses Google Gemini AI for intelligent data extraction
- **Multiple Processing Modes**: Process files individually or combine multiple files
- **Custom Field Configuration**: Define field names, data types, and AI extraction prompts
- **Template System**: Save and reuse extraction configurations
- **ZIP File Support**: Automatic extraction and processing of ZIP archives

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
