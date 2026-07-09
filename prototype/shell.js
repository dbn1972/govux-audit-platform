/* Shared shell: prototype chrome bar + app bar + sidebar.
   Each page sets window.SCREEN = {id, nav, mode} before including this. */
(function(){
  const ORDER = [
    ["index.html","Master Launcher"],
    ["login.html","Sign in (Government SSO)"],
    ["dashboard.html","Owner Dashboard"],
    ["domains.html","My Domains"],
    ["register.html","Register & Verify Domain"],
    ["configure.html","Configure Audit"],
    ["running.html","Audit in Progress"],
    ["report.html","Report — Score Overview"],
    ["issues.html","Report — Issues List"],
    ["issue-detail.html","Issue Detail & Fix"],
    ["compatibility.html","Responsiveness & Compatibility"],
    ["trends.html","Trends & Re-audit History"],
    ["compare.html","Compare & Page Coverage"],
    ["manual-review.html","Manual Review (Assessor)"],
    ["library.html","Guideline Library"],
    ["settings.html","Team & Settings"],
    ["national.html","National Dashboard (MeitY/NIC)"],
    ["bulk-scan.html","Bulk Scan & Estate Discovery"],
    ["ministries.html","Ministries Breakdown"],
    ["states.html","States & UTs"],
    ["league.html","League Table"],
    ["alerts.html","Exception Alerts"],
    ["standards.html","Standards & Rules Engine"]
  ];
  const S = window.SCREEN || {};
  const idx = ORDER.findIndex(o=>o[0]===S.id);
  const prev = idx>0 ? ORDER[idx-1] : null;
  const next = idx>=0 && idx<ORDER.length-1 ? ORDER[idx+1] : null;

  // ---- prototype chrome ----
  const proto = document.createElement('div');
  proto.className='proto';
  proto.innerHTML =
    '<span class="dot"></span><b>GovUX Audit Platform</b>'+
    '<span class="num">Interactive prototype</span>'+
    '<span class="sp"></span>'+
    '<span class="num">Screen '+(idx>=0?idx:'?')+' of '+(ORDER.length-1)+' — '+(S.title||'')+'</span>'+
    (prev?'<a href="'+prev[0]+'">&larr; Prev</a>':'')+
    (next?'<a href="'+next[0]+'">Next &rarr;</a>':'')+
    '<a class="home" href="index.html">All screens</a>';
  document.body.prepend(proto);

  if(S.mode==='none') return; // login / index handle their own layout

  // ---- gov strip + app bar ----
  const strip=document.createElement('div');strip.className='gov-strip';
  const bar=document.createElement('div');bar.className='appbar';
  const admin = S.mode==='admin';
  bar.innerHTML =
    '<div class="brand"><div class="logo">GX</div><div>GovUX<small>'+(admin?'MeitY · NIC — National view':'Audit Platform')+'</small></div></div>'+
    '<div class="grow"></div>'+
    '<div class="searchbox">'+icon('search')+'<input placeholder="Search domains, audits, guidelines…"></div>'+
    '<div class="iconbtn">'+icon('help')+'</div>'+
    '<div class="iconbtn">'+icon('bell')+'<span class="badge">3</span></div>'+
    '<div class="avatar">'+(admin?'PS':'DN')+'</div>';

  // ---- sidebar ----
  const ownerNav = [
    ['WORKSPACE', [
      ['dashboard','Dashboard','grid','dashboard.html'],
      ['domains','My Domains','globe','domains.html']
    ]],
    ['AUDITS', [
      ['configure','New Audit','play','configure.html'],
      ['report','Audit Report','doc','report.html'],
      ['issues','Issues','flag','issues.html'],
      ['compat','Responsiveness','device','compatibility.html'],
      ['trends','Trends','chart','trends.html'],
      ['compare','Compare & Coverage','diff','compare.html']
    ]],
    ['ASSESS', [
      ['manual','Manual Review','check','manual-review.html'],
      ['library','Guideline Library','book','library.html']
    ]],
    ['ACCOUNT', [
      ['settings','Team & Settings','gear','settings.html']
    ]]
  ];
  const adminNav = [
    ['OVERVIEW',[
      ['national','National Dashboard','grid','national.html'],
      ['bulk','Bulk Scan','play','bulk-scan.html'],
      ['ministries','Ministries','building','ministries.html'],
      ['states','States & UTs','map','states.html']
    ]],
    ['INSIGHTS',[
      ['league','League Table','trophy','league.html'],
      ['alerts','Alerts','bell','alerts.html'],
      ['guidelines','Standards & Rules','book','standards.html']
    ]]
  ];
  const nav = admin?adminNav:ownerNav;
  let side='';
  nav.forEach(g=>{
    side+='<div class="side-group">'+g[0]+'</div>';
    g[1].forEach(it=>{
      const on = it[0]===S.nav?' active':'';
      side+='<a class="nav-item'+on+'" href="'+it[3]+'"><span class="ic">'+icon(it[2])+'</span>'+it[1]+'</a>';
    });
  });
  side+='<div style="margin-top:22px;padding:12px;border-radius:11px;background:var(--sky);font-size:11.5px;color:#1a5f9e">'+
    '<b style="color:var(--navy)">'+(admin?'Signed in as Programme Admin':'Signed in as Nodal Officer')+'</b><br>'+
    (admin?'Ministry of Electronics & IT':'Dept. of Posts · India Post')+'</div>';

  const layout=document.createElement('div');layout.className='layout';
  const aside=document.createElement('aside');aside.className='sidebar';aside.innerHTML=side;
  const main=document.createElement('main');main.className='main';
  // move existing body content into main
  const holder=document.getElementById('page');
  layout.appendChild(aside);layout.appendChild(main);
  document.body.appendChild(strip);
  document.body.appendChild(bar);
  document.body.appendChild(layout);
  if(holder){ main.appendChild(holder); }

  function icon(n){
    const p={
      search:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
      bell:'<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
      help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7"/><path d="M12 17h.01"/>',
      grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
      globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18"/>',
      play:'<circle cx="12" cy="12" r="9"/><path d="M10 8.5l6 3.5-6 3.5z" fill="currentColor" stroke="none"/>',
      doc:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M8 13h8M8 17h6"/>',
      flag:'<path d="M4 21V4M4 4h13l-2 4 2 4H4"/>',
      chart:'<path d="M4 20V6M4 20h16M8 20v-6M12 20v-9M16 20v-4"/>',
      check:'<path d="M20 6L9 17l-5-5"/>',
      book:'<path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"/><path d="M4 19h14"/>',
      building:'<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>',
      map:'<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
      trophy:'<path d="M7 4h10v4a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9 20h6M12 15v5"/>',
      gear:'<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.5M12 18.5V21M4.2 7l2.2 1.3M17.6 15.7l2.2 1.3M4.2 17l2.2-1.3M17.6 8.3l2.2-1.3"/>',
      device:'<rect x="4" y="4" width="11" height="14" rx="1.5"/><rect x="16.5" y="9" width="4.5" height="11" rx="1"/><path d="M8 18h3"/>',
      diff:'<path d="M12 4v6M9 7h6"/><path d="M9 17h6"/><rect x="3.5" y="3.5" width="17" height="17" rx="2"/>'
    }[n]||'';
    return '<svg viewBox="0 0 24 24">'+p+'</svg>';
  }
  window._icon=icon;
})();
