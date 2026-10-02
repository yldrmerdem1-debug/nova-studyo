// Synthesises the sound-design kit with ffmpeg — no downloaded or licensed
// samples, so every render is clear to publish.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const OUT = 'public/sfx';
mkdirSync(OUT, { recursive: true });

const SFX = {
  // Low impact: two decaying sub sines plus a short noise transient for the attack.
  hit: {
    d: 1.6,
    expr: '0.85*sin(2*PI*46*t)*exp(-3.2*t)+0.45*sin(2*PI*92*t)*exp(-6*t)+0.35*(random(0)*2-1)*exp(-28*t)',
    af: 'lowpass=f=2400,volume=1.4',
  },
  // Air moving past: band-limited noise under a bell envelope.
  whoosh: {
    d: 0.75,
    expr: '(random(0)*2-1)*pow(sin(PI*t/0.75),3)*0.9',
    af: 'highpass=f=500,lowpass=f=5500',
  },
  // A counter's mechanical ticks, ~22 per second.
  ticks: {
    d: 0.9,
    expr: '0.55*sin(2*PI*2600*t)*exp(-110*mod(t,0.045))*(1-t/1.2)',
    af: 'highpass=f=900',
  },
  // Rising chirp + swelling noise into an impact.
  riser: {
    d: 1.5,
    expr: '0.5*sin(2*PI*(140*t+260*t*t))*pow(t/1.5,2)+0.3*(random(0)*2-1)*pow(t/1.5,3)',
    af: 'highpass=f=120',
  },
  // Digital crackle for the finance glitch transition.
  glitch: {
    d: 0.35,
    expr: '(random(0)*2-1)*mod(floor(t*70),2)*0.55+0.3*sin(2*PI*1800*t)*mod(floor(t*23),2)',
    af: 'highpass=f=300',
  },
  // Horror bed when no music is supplied: detuned sub drone that slowly breathes.
  drone: {
    d: 40,
    expr: '0.34*sin(2*PI*41*t)+0.3*sin(2*PI*41.8*t)+0.14*sin(2*PI*83.1*t)*(0.55+0.45*sin(2*PI*0.11*t))+0.05*(random(0)*2-1)',
    af: 'lowpass=f=520,volume=1.2',
  },
};

for (const [name, { d, expr, af }] of Object.entries(SFX)) {
  execFileSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    // Commas inside the expression would split the filter chain; escape them.
    '-f', 'lavfi', '-i', `aevalsrc=${expr.replace(/,/g, '\\,')}:s=48000:d=${d}`,
    '-af', `${af},afade=t=out:st=${Math.max(0, d - 0.08)}:d=0.08,aformat=channel_layouts=stereo`,
    `${OUT}/${name}.wav`,
  ]);
  console.log('uretildi:', `${name}.wav`);
}
