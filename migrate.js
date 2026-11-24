const {Pool}=require('pg'),fs=require('fs');
const p=new Pool({connectionString:process.env.DATABASE_URL});
p.query(fs.readFileSync(__dirname+'/schema.sql','utf8')).then(()=>{console.log('Migratsiya tayyor');p.end()}).catch(e=>{console.error(e);process.exit(1)});
