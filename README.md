# KH | Khudoyberdiev Contacts
## Ishga tushirish
1. PostgreSQL bazasi yarating, `.env.example` ni `.env` ga nusxalab to'ldiring (ADMIN_PASSWORD ni o'zingiz yozing).
2. `npm install`
3. `export $(cat .env | xargs) && npm run migrate`
4. `export $(cat .env | xargs) && npm start` -> http://localhost:3000
Admin: Khudoyberdiyev_admin (parol .env dan). 
## Deploy (Render/Railway/VPS)
Node servis + PostgreSQL qo'shing, env o'zgaruvchilarni kiriting, `NODE_ENV=production`, build: `npm install && npm run migrate`, start: `npm start`. HTTPS majburiy. Zaxira: `pg_dump $DATABASE_URL > backup.sql` (cron bilan).
