import { resolve } from 'path'; 
import { createProxy, detectSceneBoundaries } from './src/media/ffmpeg.js'; 
import { execSync } from 'child_process'; 

const inPath = resolve('scratch/dummy.mp4'); 
execSync('ffmpeg -y -f lavfi -i testsrc=duration=2:size=1280x720:rate=30 "' + inPath + '"', {stdio:'inherit'}); 

async function run() {
  try {
    await createProxy(inPath, resolve('scratch/proxy.mp4'));
    console.log('PROXY SUCCESS');
    await detectSceneBoundaries(inPath);
    console.log('DETECT SCENES SUCCESS');
  } catch(e) {
    console.error('ERROR', e);
  }
}
run();
