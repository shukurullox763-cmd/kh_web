CREATE TABLE IF NOT EXISTS users(
 id SERIAL PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
 username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'user' CHECK(role IN('user','admin')),
 blocked BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS ranks(id SERIAL PRIMARY KEY, name TEXT NOT NULL, min_points INT UNIQUE NOT NULL, color TEXT NOT NULL, icon TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks(
 id SERIAL PRIMARY KEY, category TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 statement TEXT NOT NULL, difficulty INT NOT NULL CHECK(difficulty BETWEEN 1 AND 100),
 max_points INT NOT NULL, deadline TIMESTAMPTZ, published BOOLEAN NOT NULL DEFAULT true,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS submissions(
 id SERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id), task_id INT NOT NULL REFERENCES tasks(id),
 language TEXT NOT NULL, code TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','under_review','approved','revision_required')),
 score INT, max_points_snapshot INT NOT NULL, feedback TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), reviewed_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS points_history(
 id SERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id),
 submission_id INT UNIQUE REFERENCES submissions(id), points INT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS notifications(
 id SERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id), text TEXT NOT NULL,
 is_read BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS admin_log(id SERIAL PRIMARY KEY, admin_id INT NOT NULL REFERENCES users(id), action TEXT NOT NULL, details TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
INSERT INTO ranks(name,min_points,color,icon) VALUES
('NEWBIE',0,'#9ca3af','🌱'),('LEARNER',200,'#3b82f6','📘'),('BRONZE',500,'#cd7f32','🥉'),('SILVER',1000,'#c0c0c0','🥈'),
('GOLD',1800,'#ffd700','🥇'),('PRO',2800,'#a855f7','💎'),('MASTER',4000,'#f97316','🔥'),('PROGRAMMER',5500,'#06b6d4','💻'),
('DIAMOND',7500,'#7dd3fc','💠'),('GRANDMASTER',10000,'#ef4444','👑') ON CONFLICT DO NOTHING;
