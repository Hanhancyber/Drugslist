const params=new URLSearchParams(location.search),fragment=new URLSearchParams(location.hash.slice(1));
if(params.has('drug')||params.has('join')||fragment.has('verify')||fragment.has('reset'))location.replace('drugs.html'+location.search+location.hash);
