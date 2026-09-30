Add-Type -AssemblyName System.Speech
# Synthetic learner utterances for the live Aloud level drive (Windows System.Speech, not a human voice).
$out = Join-Path $PSScriptRoot '..\..\fixtures\audio\live'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$lines = [ordered]@{
  'say-weight'   = 'An attention weight says how much one token listens to another token before the value vectors are averaged.'
  'say-why'      = 'Without self attention a token could not compare itself with every other token, so the model would lose context across the sequence.'
  'claim-real'   = 'I think this claim is real. It matches what my notes say.'
  'claim-bluff'  = 'That is a bluff. It is self attention, not backpropagation, that is permutation equivariant.'
  'interrupt'    = 'Wait, can you repeat the question?'
  'boss-bluff'   = 'That is a bluff. The page says the opposite.'
  'boss-qkv'     = 'Queries ask what a token is looking for, keys advertise what a token holds, and values carry the content that gets passed along.'
}
foreach ($name in $lines.Keys) {
  $wav = Join-Path $out "$name.wav"
  $spoken = $lines[$name]
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $s.SetOutputToWaveFile($wav)
  $s.Speak($spoken)
  $s.Dispose()
  Set-Content -LiteralPath (Join-Path $out "$name.txt") -Value "Synthetic speech, generated with Windows System.Speech. Spoken text: $spoken" -Encoding UTF8
  Write-Output "$name.wav generated (synthetic learner voice)"
}
