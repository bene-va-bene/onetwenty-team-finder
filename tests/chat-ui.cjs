/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS browser test with optional Playwright. */
// Browser interaction test against mocked Auth/RPC. Run with Playwright installed and
// NEXT_PUBLIC_SUPABASE_URL=https://chat-test.supabase.co, public key=test-public-key.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({headless:true,executablePath:process.env.CHAT_TEST_BROWSER||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try {
 for (const width of [390,1280]) {
  const context = await browser.newContext({viewport:{width,height:844}});
  const uid='11111111-1111-4111-8111-111111111111';
  const thread='33333333-3333-4333-8333-333333333333';
  const exp=Math.floor(Date.now()/1000)+3600;
  const user={id:uid,email:'fixture@example.invalid',email_confirmed_at:new Date().toISOString(),app_metadata:{provider:'email'},user_metadata:{},aud:'authenticated',created_at:new Date().toISOString()};
  const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,role:'authenticated',exp})).toString('base64url')+'.fixture';
  await context.addInitScript(({user,token,exp})=>localStorage.setItem('sb-chat-test-auth-token',JSON.stringify({user,access_token:token,refresh_token:'fixture',expires_at:exp,expires_in:3600,token_type:'bearer'})),{user,token,exp});
  let started=false, blocked=false, seen=0, sends=0;
  const messages=[];
  const listing={id:'22222222-2222-4222-8222-222222222222',type:'team',name:'Test Team',region:'Münster',description:'Ride together',languages:'EN',categories:['Mixed'],vibes:['Let’s shred'],seeking:'Anyone',ridersNeeded:1,image_path:null,published_at:new Date().toISOString(),expires_at:'2027-07-18T00:00:00Z',status:'active',strava:'',instagram:''};
  await context.route('https://chat-test.supabase.co/**',async route=>{
   const req=route.request(), url=new URL(req.url()); let data;
   if(url.pathname==='/auth/v1/user') data=user;
   else if(url.pathname==='/auth/v1/logout') data={};
   else {
    const args=req.postDataJSON()??{};
    switch(url.pathname.split('/').at(-1)) {
     case 'list_public_listings': data=[listing]; break;
     case 'chat_unread': data=messages.filter(x=>!x.mine && x.id>seen).length; break;
     case 'chat_inbox': data=started?[{id:thread,listing_name:listing.name,peer_name:listing.name,unread:messages.filter(x=>!x.mine&&x.id>seen).length,blocked,blocked_by_me:blocked,expires_at:listing.expires_at}]:[]; break;
     case 'send_chat': assert.equal(args.p_name,'Bene'); started=true; sends++; messages.push({id:1,body:args.p_body,mine:true,created_at:new Date().toISOString()}); data=thread; break;
     case 'read_chat': data=messages.filter(x=>(!args.p_after||x.id>args.p_after)&&(!args.p_before||x.id<args.p_before)); break;
     case 'seen_chat': seen=Math.max(seen,args.p_seen); data=null; break;
     case 'reply_chat': sends++; messages.push({id:messages.length+1,body:args.p_body,mine:true,created_at:new Date().toISOString()}); data=null; break;
     case 'block_chat': blocked=args.p_block; data=null; break;
     default: throw new Error('Unexpected RPC '+url.pathname);
    }
   }
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.CHAT_TEST_URL||'http://127.0.0.1:3101');
  await page.getByRole('button',{name:'MESSAGES',exact:true}).click();
  await page.getByText('No conversations yet.',{exact:false}).waitFor();
  await page.getByRole('button',{name:'CLOSE ×',exact:true}).click();
  await page.getByRole('button',{name:'VIEW PROFILE'}).click();
  await page.getByRole('button',{name:'SEND MESSAGE',exact:true}).click();
  await page.getByLabel('YOUR NAME IN THIS CHAT').fill('Bene');
  await page.getByLabel('YOUR MESSAGE',{exact:true}).fill('Hello <script>alert(1)</script>');
  await page.getByRole('button',{name:'SEND MESSAGE',exact:true}).click();
  await page.getByRole('log').getByText('Hello <script>alert(1)</script>',{exact:true}).waitFor();
  assert.equal(sends,1);
  await page.getByLabel('YOUR MESSAGE',{exact:true}).fill('Second message');
  await page.getByRole('button',{name:'SEND MESSAGE',exact:true}).click();
  await page.getByRole('log').getByText('Second message',{exact:true}).waitFor();
  assert.equal(sends,2);
  messages.push({id:3,body:'Reply from team',mine:false,created_at:new Date().toISOString()});
  await page.getByRole('log').getByText('Reply from team',{exact:true}).waitFor({timeout:12000});
  await page.getByRole('button',{name:'BLOCK CONVERSATION',exact:true}).click();
  await page.getByText('Messaging is paused in this conversation.').waitFor();
  assert.equal(await page.getByLabel('YOUR MESSAGE',{exact:true}).count(),0);
  await page.getByRole('button',{name:'UNBLOCK CONVERSATION',exact:true}).click();
  await page.getByLabel('YOUR MESSAGE',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`/tmp/teamfinder-chat-${width}.png`,fullPage:false});
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(),0);
  await page.getByRole('button',{name:/^MESSAGES/}).click();
  await page.getByRole('button',{name:/Test Team.*Test Team/}).click();
  await page.getByRole('log').getByText('Second message',{exact:true}).waitFor();
  await page.getByRole('button',{name:'CLOSE ×',exact:true}).click();
  await page.getByRole('button',{name:'SIGN OUT',exact:true}).click();
  await page.getByRole('button',{name:'SIGN IN',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:/^MESSAGES/}).count(),0);
  assert.deepEqual(errors,[]);
  const response=await page.request.post((process.env.CHAT_TEST_URL||'http://127.0.0.1:3101')+'/api/contact');
  assert.equal(response.status(),410);
  console.log(`PASS ${width}px: no-listing sender, first message, reply, polling, block/unblock, text escaping, reopen, sign-out, no overflow, retired endpoint`);
  await context.close();
 }
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
