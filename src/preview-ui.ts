const keepAlive=()=>fetch('/heartbeat',{method:'POST'}).catch(()=>{});
keepAlive();setInterval(keepAlive,15000);
