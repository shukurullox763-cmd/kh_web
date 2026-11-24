const express=require('express'),session=require('express-session'),PgStore=require('connect-pg-simple')(session),
 helmet=require('helmet'),rateLimit=require('express-rate-limit'),bcrypt=require('bcryptjs'),{Pool}=require('pg');
const db=new Pool({connectionString:process.env.DATABASE_URL}), q=(s,a)=>db.query(s,a), app=express();
app.set('trust proxy',1);
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],scriptSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'","data:"]}}}));
app.use(express.json({limit:'200kb'}));
app.use(session({store:new PgStore({pool:db,createTableIfMissing:true}),secret:process.env.SESSION_SECRET,resave:false,saveUninitialized:false,
 cookie:{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',maxAge:7*864e5}}));
// CSRF himoyasi: sameSite=strict + o'zgartiruvchi so'rovlarda maxsus header
app.use('/api',(req,res,n)=>{if(req.method!=='GET'&&req.get('X-KH')!=='1')return res.status(403).json({error:'CSRF'});n()});
app.use('/api/login',rateLimit({windowMs:15*6e4,max:20}));app.use('/api/register',rateLimit({windowMs:6e4*60,max:20}));
const wrap=f=>(a,b,c)=>f(a,b,c).catch(e=>{console.error(e);b.status(500).json({error:'Server xatosi'})});
const auth=(req,res,n)=>req.session.uid?n():res.status(401).json({error:'Kirish kerak'});
const admin=(req,res,n)=>req.session.role==='admin'?n():res.status(403).json({error:'Ruxsat yo\'q'});

async function userInfo(id){
 const u=(await q('SELECT id,first_name,last_name,username,role FROM users WHERE id=$1',[id])).rows[0];
 const pts=+(await q('SELECT COALESCE(SUM(points),0) s FROM points_history WHERE user_id=$1',[id])).rows[0].s;
 const ranks=(await q('SELECT * FROM ranks ORDER BY min_points')).rows;
 let i=0;ranks.forEach((r,k)=>{if(pts>=r.min_points)i=k});
 const st=(await q(`SELECT COUNT(*) FILTER(WHERE status='approved') ok, COUNT(*) total FROM submissions WHERE user_id=$1`,[id])).rows[0];
 const next=ranks[i+1];
 return{...u,points:pts,rank:ranks[i],next_rank:next||null,progress:next?Math.round((pts-ranks[i].min_points)/(next.min_points-ranks[i].min_points)*100):100,
  completed:+st.ok,accuracy:+st.total?Math.round(st.ok/st.total*100):0};
}
app.post('/api/register',wrap(async(req,res)=>{
 const{first_name,last_name,username,password,confirm}=req.body||{};
 if(![first_name,last_name,username,password].every(x=>typeof x==='string'&&x.trim()))return res.status(400).json({error:'Barcha maydonlarni to\'ldiring'});
 if(!/^[A-Za-z0-9_]{3,30}$/.test(username))return res.status(400).json({error:'Username: 3-30 ta harf, raqam yoki _'});
 if(password.length<6)return res.status(400).json({error:'Parol kamida 6 belgi'});
 if(password!==confirm)return res.status(400).json({error:'Parollar mos emas'});
 const h=await bcrypt.hash(password,12);
 try{const r=await q('INSERT INTO users(first_name,last_name,username,password_hash) VALUES($1,$2,$3,$4) RETURNING id',[first_name.trim().slice(0,50),last_name.trim().slice(0,50),username,h]);
  req.session.uid=r.rows[0].id;req.session.role='user';res.json({ok:true});
 }catch(e){if(e.code==='23505')return res.status(409).json({error:'Bu username band'});throw e}
}));
app.post('/api/login',wrap(async(req,res)=>{
 const{username,password}=req.body||{};
 const u=(await q('SELECT * FROM users WHERE lower(username)=lower($1)',[String(username||'')])).rows[0];
 if(!u||!(await bcrypt.compare(String(password||''),u.password_hash)))return res.status(401).json({error:'Username yoki parol noto\'g\'ri'});
 if(u.blocked)return res.status(403).json({error:'Akkaunt bloklangan'});
 req.session.regenerate(()=>{req.session.uid=u.id;req.session.role=u.role;res.json({ok:true})});
}));
app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get('/api/me',auth,wrap(async(req,res)=>res.json(await userInfo(req.session.uid))));

app.get('/api/tasks',auth,wrap(async(req,res)=>res.json((await q('SELECT id,category,title,description,statement,difficulty,max_points,deadline FROM tasks WHERE published ORDER BY created_at DESC')).rows)));
app.post('/api/submissions',auth,wrap(async(req,res)=>{
 const{task_id,language,code}=req.body||{};
 const t=(await q('SELECT * FROM tasks WHERE id=$1 AND published',[+task_id])).rows[0];
 if(!t)return res.status(404).json({error:'Topshiriq topilmadi'});
 if(t.deadline&&new Date(t.deadline)<new Date())return res.status(400).json({error:'Muddat tugagan'});
 if(typeof code!=='string'||!code.trim()||code.length>50000||typeof language!=='string')return res.status(400).json({error:'Kod noto\'g\'ri'});
 const ex=(await q(`SELECT 1 FROM submissions WHERE user_id=$1 AND task_id=$2 AND status IN('pending','under_review','approved')`,[req.session.uid,t.id])).rowCount;
 if(ex)return res.status(400).json({error:'Bu topshiriq uchun yechim allaqachon yuborilgan yoki tasdiqlangan'});
 // Kod HECH QACHON ishga tushirilmaydi — faqat saqlanadi
 await q('INSERT INTO submissions(user_id,task_id,language,code,max_points_snapshot) VALUES($1,$2,$3,$4,$5)',[req.session.uid,t.id,language.slice(0,30),code,t.max_points]);
 res.json({ok:true});
}));
app.get('/api/submissions',auth,wrap(async(req,res)=>res.json((await q(`SELECT s.id,t.title,s.language,s.status,s.score,s.max_points_snapshot,s.feedback,s.created_at FROM submissions s JOIN tasks t ON t.id=s.task_id WHERE s.user_id=$1 ORDER BY s.id DESC`,[req.session.uid])).rows)));
app.get('/api/notifications',auth,wrap(async(req,res)=>res.json((await q('SELECT id,text,is_read,created_at FROM notifications WHERE user_id=$1 ORDER BY id DESC LIMIT 30',[req.session.uid])).rows)));
app.post('/api/notifications/read',auth,wrap(async(req,res)=>{await q('UPDATE notifications SET is_read=true WHERE user_id=$1',[req.session.uid]);res.json({ok:true})}));

app.get('/api/leaderboard',auth,wrap(async(req,res)=>{
 const f={daily:`AND p.created_at>=date_trunc('day',now())`,weekly:`AND p.created_at>=date_trunc('week',now())`}[req.query.period]||'';
 // Teng ballarda: ko'p tasdiqlangan topshiriq, so'ng ballarga erta yetgan, so'ng username
 res.json((await q(`SELECT u.username,SUM(p.points)::int points,COUNT(p.submission_id)::int tasks,MAX(p.created_at) last_at,
  (SELECT r.name FROM ranks r WHERE r.min_points<=(SELECT COALESCE(SUM(points),0) FROM points_history WHERE user_id=u.id) ORDER BY r.min_points DESC LIMIT 1) rank
  FROM points_history p JOIN users u ON u.id=p.user_id WHERE u.blocked=false ${f} GROUP BY u.id HAVING SUM(p.points)>0
  ORDER BY points DESC,tasks DESC,last_at ASC,u.username LIMIT 50`)).rows);
}));

// ---- ADMIN ----
app.get('/api/admin/stats',auth,admin,wrap(async(req,res)=>res.json((await q(`SELECT (SELECT COUNT(*) FROM users) users,(SELECT COUNT(*) FROM tasks) tasks,(SELECT COUNT(*) FROM submissions) submissions,(SELECT COUNT(*) FROM submissions WHERE status='pending') pending,(SELECT COALESCE(SUM(points),0) FROM points_history) points`)).rows[0])));
app.post('/api/admin/tasks',auth,admin,wrap(async(req,res)=>{
 const{category,title,description,statement,difficulty,deadline}=req.body||{},d=Math.round(+difficulty);
 if(!category||!title||!statement||!(d>=1&&d<=100))return res.status(400).json({error:'Maydonlar noto\'g\'ri (qiyinlik 1-100)'});
 const r=await q('INSERT INTO tasks(category,title,description,statement,difficulty,max_points,deadline) VALUES($1,$2,$3,$4,$5,$5,$6) RETURNING id',[category,title,description||'',statement,d,deadline||null]);
 await q('INSERT INTO notifications(user_id,text) SELECT id,$1 FROM users WHERE role=\'user\'',['Yangi topshiriq: '+title]);
 await q('INSERT INTO admin_log(admin_id,action,details) VALUES($1,$2,$3)',[req.session.uid,'task_create','#'+r.rows[0].id+' '+title]);
 res.json({ok:true});
}));
app.get('/api/admin/submissions',auth,admin,wrap(async(req,res)=>res.json((await q(`SELECT s.id,u.username,t.title,s.language,s.code,s.status,s.score,s.max_points_snapshot,s.feedback FROM submissions s JOIN users u ON u.id=s.user_id JOIN tasks t ON t.id=s.task_id ORDER BY (s.status IN('pending','under_review')) DESC,s.id DESC LIMIT 100`)).rows)));
app.post('/api/admin/submissions/:id/review',auth,admin,wrap(async(req,res)=>{
 const{status,score,feedback}=req.body||{};
 if(!['under_review','approved','revision_required'].includes(status))return res.status(400).json({error:'Status noto\'g\'ri'});
 const c=await db.connect();
 try{await c.query('BEGIN');
  const s=(await c.query('SELECT * FROM submissions WHERE id=$1 FOR UPDATE',[+req.params.id])).rows[0];
  if(!s){await c.query('ROLLBACK');return res.status(404).json({error:'Topilmadi'})}
  let sc=null;
  if(status==='approved'){sc=Math.round(+score);
   if(!(sc>=0&&sc<=s.max_points_snapshot)){await c.query('ROLLBACK');return res.status(400).json({error:`Ball 0 dan ${s.max_points_snapshot} gacha bo'lishi kerak`})}}
  await c.query('UPDATE submissions SET status=$1,score=$2,feedback=$3,reviewed_at=now() WHERE id=$4',[status,sc,String(feedback||'').slice(0,2000),s.id]);
  await c.query('DELETE FROM points_history WHERE submission_id=$1',[s.id]);
  if(status==='approved')await c.query('INSERT INTO points_history(user_id,submission_id,points) VALUES($1,$2,$3)',[s.user_id,s.id,sc]);
  await c.query('INSERT INTO notifications(user_id,text) VALUES($1,$2)',[s.user_id,status==='approved'?`Yechimingiz tasdiqlandi: +${sc} ball`:status==='revision_required'?'Yechimingizga tuzatish kerak. Izohni o\'qing.':'Yechimingiz ko\'rib chiqilmoqda']);
  await c.query('INSERT INTO admin_log(admin_id,action,details) VALUES($1,$2,$3)',[req.session.uid,'review','sub#'+s.id+' '+status+' '+sc]);
  await c.query('COMMIT');res.json({ok:true});
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}));

app.use(express.static(__dirname+'/public'));
(async()=>{ // Admin hisobi serverdagi env orqali yaratiladi
 const{ADMIN_USERNAME:n,ADMIN_PASSWORD:p}=process.env;
 if(n&&p&&!(await q('SELECT 1 FROM users WHERE username=$1',[n])).rowCount)
  await q(`INSERT INTO users(first_name,last_name,username,password_hash,role) VALUES('Admin','KH',$1,$2,'admin')`,[n,await bcrypt.hash(p,12)]);
 app.listen(process.env.PORT||3000,()=>console.log('KH Contacts ishga tushdi'));
})();
