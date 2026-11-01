# Restaurant Billing & Guest House Management System

## Quick Start

### 1. Database Setup
```sql
CREATE DATABASE restaurant_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE restaurant_db;
SOURCE database/schema.sql;
```

### 2. Backend (PHP 8.1+)
Edit `backend/config/database.php` with your DB credentials.

```bash
cd backend
php -S localhost:8000
```

### 3. Frontend (Node 18+)
```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:3000
```

## Login
- **Username:** admin
- **Password:** Admin@1234

## Tech Stack
- Frontend: React 18 + Tailwind CSS + Vite
- Backend: Plain PHP 8.1 (no framework)
- Database: MySQL 8

## API Base URL
All API endpoints are prefixed with `/api`
Backend runs on `http://localhost:8000`
Frontend proxies `/api/*` → backend via Vite config.
# KrishnaRasoi
