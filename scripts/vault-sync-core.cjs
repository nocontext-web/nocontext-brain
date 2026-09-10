const {createHash}=require('node:crypto');
const hash=text=>text==null?null:createHash('sha256').update(text).digest('hex');
function decide(local,remote,base){
 const l=hash(local),r=hash(remote);
 if(l===r)return 'same';
 if(base===undefined){if(l===null)return 'pull';if(r===null)return 'push';return 'conflict';}
 if(l===base)return r===null?'conflict':'pull';
 if(r===base)return l===null?'conflict':'push';
 return 'conflict';
}
function safePath(root,relative){const path=require('node:path');const target=path.resolve(root,relative);if(!target.startsWith(path.resolve(root)+path.sep)||!relative.endsWith('.md'))throw Error('Invalid vault path');return target;}
module.exports={hash,decide,safePath};
