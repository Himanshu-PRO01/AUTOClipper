Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = 0
$audioFile = Join-Path $PWD "full_speech.wav"
$synth.SetOutputToWaveFile($audioFile)

$scriptText = "Did you know that ninety percent of viral videos hook the viewer in the first three seconds? The biggest mistake creators make is introducing themselves before showing the value. Here is the secret to keeping audience retention high. Always use bold captions, dynamic pacing, and cut out all boring silence. If you follow this rule, your average watch time will skyrocket immediately. Finally, end your clip with an irresistible question that keeps people commenting. Subscribe for more content creation masterclasses."
$synth.Speak($scriptText)
$synth.Dispose()

$ffprobe = "C:\Users\Ram Kesh\ffmpeg\ffprobe.exe"
$duration = & $ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $audioFile
Write-Host "Synthesized audio duration: $duration seconds"

$ffmpeg = "C:\Users\Ram Kesh\ffmpeg\ffmpeg.exe"
$videoFile = Join-Path $PWD "demo_viral_video.mp4"

# Generate 3 distinct colored scenes concatenated together to trigger scene boundary detection
& $ffmpeg -y `
  -f lavfi -i "color=c=darkblue:s=1280x720:r=30:d=15" `
  -f lavfi -i "color=c=darkred:s=1280x720:r=30:d=15" `
  -f lavfi -i "color=c=darkgreen:s=1280x720:r=30:d=15" `
  -i $audioFile `
  -filter_complex "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]" `
  -map "[v]" -map 3:a `
  -c:v libx264 -preset veryfast -pix_fmt yuv420p `
  -c:a aac -b:a 192k `
  -shortest `
  $videoFile

$videoDuration = & $ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $videoFile
Write-Host "Generated test video duration: $videoDuration seconds"
