export class AudioEngine {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaElementAudioSourceNode | MediaStreamAudioSourceNode | null = null;
  private dataArray: Uint8Array | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private streamDest: MediaStreamAudioDestinationNode | null = null;

  // Beat Detection State
  private beatCutoff: number = 0;
  private beatTime: number = 0;

  constructor(options?: any) {
    // Lazy init handled in methods
  }

  async initMic(): Promise<void> {
    if (this.audioCtx) await this.cleanup();
    
    this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 4096; 
    this.analyser.smoothingTimeConstant = 0.85; 
    
    // Destination for recording
    this.streamDest = this.audioCtx.createMediaStreamDestination();
    
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.source = this.audioCtx.createMediaStreamSource(stream);
    this.source.connect(this.analyser);
    
    // Connect analyser to stream destination (for recording)
    // Note: We don't connect mic to audioCtx.destination to avoid feedback
    this.analyser.connect(this.streamDest);
    
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
  }

  async initFile(file: File): Promise<void> {
    if (this.audioCtx) await this.cleanup();

    this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 4096;
    this.analyser.smoothingTimeConstant = 0.85;

    // Destination for recording
    this.streamDest = this.audioCtx.createMediaStreamDestination();

    this.audioElement = new Audio();
    this.audioElement.src = URL.createObjectURL(file);
    this.audioElement.loop = true;
    
    // Wait for load
    await new Promise((resolve) => {
        if(this.audioElement) {
            this.audioElement.oncanplay = resolve;
        }
    });

    this.source = this.audioCtx.createMediaElementSource(this.audioElement);
    this.source.connect(this.analyser);
    
    // Connect to speakers
    this.analyser.connect(this.audioCtx.destination);
    
    // Connect to recording stream
    this.analyser.connect(this.streamDest);
    
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.audioElement.play();
  }

  getStream(): MediaStream | null {
    return this.streamDest ? this.streamDest.stream : null;
  }

  getAnalysis() {
    if (!this.analyser || !this.dataArray) {
      return { bass: 0, mid: 0, high: 0, level: 0, beat: false, centroid: 0, dominantFreq: 0 };
    }

    this.analyser.getByteFrequencyData(this.dataArray);

    const length = this.dataArray.length;
    const nyquist = this.audioCtx ? this.audioCtx.sampleRate / 2 : 22050;
    const binSize = nyquist / length;

    // Simple frequency banding
    const bassRange = Math.floor(length * 0.05); // Bottom 5%
    const midRange = Math.floor(length * 0.25);  // Next 20%
    
    let bassSum = 0;
    let midSum = 0;
    let highSum = 0;
    
    // Spectral Centroid & Dominant Freq Params
    let weightedSum = 0;
    let totalAmp = 0;
    let maxAmp = 0;
    let maxBin = 0;

    for (let i = 0; i < length; i++) {
      const val = this.dataArray[i] / 255.0;
      
      // Banding
      if (i < bassRange) bassSum += val;
      else if (i < midRange) midSum += val;
      else highSum += val;

      // Centroid
      weightedSum += i * val;
      totalAmp += val;

      // Dominant
      if (val > maxAmp) {
        maxAmp = val;
        maxBin = i;
      }
    }

    const bass = bassSum / bassRange || 0;
    const mid = midSum / (midRange - bassRange) || 0;
    const high = highSum / (length - midRange) || 0;
    const level = (bass + mid + high) / 3;

    // Normalize centroid (0-1)
    const centroidBin = totalAmp > 0 ? weightedSum / totalAmp : 0;
    const centroid = centroidBin / length;
    
    // Hz approximation
    const dominantFreq = maxBin * binSize;

    // --- Beat Detection Logic ---
    let beat = false;
    const now = Date.now();
    
    if (level > this.beatCutoff && level > 0.1) {
        if (now - this.beatTime > 250) { 
            beat = true;
            this.beatTime = now;
            this.beatCutoff = level * 1.1;
        }
    } else {
        this.beatCutoff *= 0.95;
        if (this.beatCutoff < 0.1) this.beatCutoff = 0.1;
    }

    return { bass, mid, high, level, beat, centroid, dominantFreq };
  }

  async cleanup() {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = '';
      this.audioElement = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.streamDest) {
        this.streamDest = null;
    }
    if (this.audioCtx) {
      if (this.audioCtx.state !== 'closed') {
        await this.audioCtx.close();
      }
      this.audioCtx = null;
    }
  }

  resume() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    if (this.audioElement && this.audioElement.paused) {
        this.audioElement.play();
    }
  }
}