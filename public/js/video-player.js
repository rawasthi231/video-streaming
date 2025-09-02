/**
 * Advanced Video Player Component
 * Hotstar-like video player with quality switching, advanced controls, and HLS support
 */

class AdvancedVideoPlayer {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      autoplay: options.autoplay || false,
      poster: options.poster || '',
      hlsUrl: options.hlsUrl || '',
      title: options.title || '',
      ...options
    };
    
    this.hls = null;
    this.video = null;
    this.currentQuality = 'auto';
    this.isFullscreen = false;
    this.isPlaying = false;
    this.isMuted = false;
    this.currentTime = 0;
    this.duration = 0;
    this.volume = 1;
    this.availableQualities = [];
    this.showControls = true;
    this.controlsTimeout = null;
    
    this.init();
  }

  init() {
    this.createPlayerHTML();
    this.setupEventListeners();
    this.setupHLS();
    this.setupControlsAutoHide();
  }

  createPlayerHTML() {
    this.container.innerHTML = `
      <div class="advanced-video-player" id="advanced-player">
        <video
          id="video-element"
          poster="${this.options.poster}"
          preload="metadata"
          webkit-playsinline
          playsinline
        >
          <p>Your browser does not support video playback.</p>
        </video>
        
        <!-- Loading Spinner -->
        <div class="video-loading" id="video-loading">
          <div class="loading-spinner"></div>
          <span>Loading video...</span>
        </div>
        
        <!-- Big Play Button -->
        <div class="big-play-button" id="big-play-button">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </div>
        
        <!-- Video Controls -->
        <div class="video-controls" id="video-controls">
          <!-- Progress Bar -->
          <div class="progress-container">
            <div class="progress-bar" id="progress-bar">
              <div class="progress-buffer" id="progress-buffer"></div>
              <div class="progress-played" id="progress-played"></div>
              <div class="progress-handle" id="progress-handle"></div>
            </div>
          </div>
          
          <!-- Control Buttons -->
          <div class="controls-bottom">
            <div class="controls-left">
              <button class="control-btn play-pause-btn" id="play-pause-btn" title="Play/Pause">
                <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
                <svg class="pause-icon hidden" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                </svg>
              </button>
              
              <div class="volume-container">
                <button class="control-btn volume-btn" id="volume-btn" title="Mute/Unmute">
                  <svg class="volume-high-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                  </svg>
                  <svg class="volume-muted-icon hidden" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                  </svg>
                </button>
                <div class="volume-slider-container">
                  <input type="range" class="volume-slider" id="volume-slider" min="0" max="100" value="100" title="Volume">
                </div>
              </div>
              
              <div class="time-display">
                <span id="current-time">0:00</span>
                <span class="time-separator">/</span>
                <span id="duration-time">0:00</span>
              </div>
            </div>
            
            <div class="controls-right">
              <div class="quality-container">
                <button class="control-btn quality-btn" id="quality-btn" title="Quality">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 7H7v10h2V7zm6 0h-2v10h2V7zm4 10V7h-2v10h2zm2-12H2v14h19V5z"/>
                  </svg>
                  <span class="quality-text">AUTO</span>
                </button>
                <div class="quality-menu" id="quality-menu">
                  <div class="quality-option active" data-quality="auto">
                    <span>Auto</span>
                    <svg class="checkmark" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                  </div>
                </div>
              </div>
              
              <button class="control-btn settings-btn" id="settings-btn" title="Settings">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
                </svg>
              </button>
              
              <button class="control-btn fullscreen-btn" id="fullscreen-btn" title="Fullscreen">
                <svg class="fullscreen-enter-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                </svg>
                <svg class="fullscreen-exit-icon hidden" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
        
        <!-- Settings Menu -->
        <div class="settings-menu" id="settings-menu">
          <div class="settings-item">
            <span>Playback Speed</span>
            <select id="playback-speed">
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1" selected>1x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2x</option>
            </select>
          </div>
        </div>
        
        <!-- Error Message -->
        <div class="video-error hidden" id="video-error">
          <div class="error-content">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            <h3>Playback Error</h3>
            <p>Unable to load the video. Please try again.</p>
            <button class="btn btn-primary" onclick="location.reload()">Retry</button>
          </div>
        </div>
      </div>
    `;

    // Get references to elements
    this.video = this.container.querySelector('#video-element');
    this.bigPlayButton = this.container.querySelector('#big-play-button');
    this.controls = this.container.querySelector('#video-controls');
    this.playPauseBtn = this.container.querySelector('#play-pause-btn');
    this.progressBar = this.container.querySelector('#progress-bar');
    this.progressPlayed = this.container.querySelector('#progress-played');
    this.progressBuffer = this.container.querySelector('#progress-buffer');
    this.progressHandle = this.container.querySelector('#progress-handle');
    this.currentTimeDisplay = this.container.querySelector('#current-time');
    this.durationDisplay = this.container.querySelector('#duration-time');
    this.volumeBtn = this.container.querySelector('#volume-btn');
    this.volumeSlider = this.container.querySelector('#volume-slider');
    this.qualityBtn = this.container.querySelector('#quality-btn');
    this.qualityMenu = this.container.querySelector('#quality-menu');
    this.settingsBtn = this.container.querySelector('#settings-btn');
    this.settingsMenu = this.container.querySelector('#settings-menu');
    this.fullscreenBtn = this.container.querySelector('#fullscreen-btn');
    this.playbackSpeedSelect = this.container.querySelector('#playback-speed');
    this.loadingIndicator = this.container.querySelector('#video-loading');
    this.errorDisplay = this.container.querySelector('#video-error');
  }

  setupEventListeners() {
    // Video events
    this.video.addEventListener('loadedmetadata', () => this.onLoadedMetadata());
    this.video.addEventListener('timeupdate', () => this.onTimeUpdate());
    this.video.addEventListener('progress', () => this.onProgress());
    this.video.addEventListener('play', () => this.onPlay());
    this.video.addEventListener('pause', () => this.onPause());
    this.video.addEventListener('ended', () => this.onEnded());
    this.video.addEventListener('waiting', () => this.onWaiting());
    this.video.addEventListener('playing', () => this.onPlaying());
    this.video.addEventListener('error', () => this.onError());
    this.video.addEventListener('volumechange', () => this.onVolumeChange());

    // Control events
    this.bigPlayButton.addEventListener('click', () => this.togglePlayPause());
    this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
    this.volumeBtn.addEventListener('click', () => this.toggleMute());
    this.volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value / 100));
    this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
    this.qualityBtn.addEventListener('click', () => this.toggleQualityMenu());
    this.settingsBtn.addEventListener('click', () => this.toggleSettingsMenu());
    this.playbackSpeedSelect.addEventListener('change', (e) => this.setPlaybackSpeed(e.target.value));

    // Progress bar interaction
    this.progressBar.addEventListener('click', (e) => this.seek(e));
    this.progressBar.addEventListener('mousedown', (e) => this.startSeeking(e));
    
    // Player container events
    this.container.addEventListener('click', (e) => this.onPlayerClick(e));
    this.container.addEventListener('dblclick', () => this.toggleFullscreen());
    this.container.addEventListener('mousemove', () => this.showControlsTemporarily());
    this.container.addEventListener('mouseleave', () => this.hideControls());

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.onKeydown(e));
    
    // Fullscreen events
    document.addEventListener('fullscreenchange', () => this.onFullscreenChange());
    document.addEventListener('webkitfullscreenchange', () => this.onFullscreenChange());
    document.addEventListener('mozfullscreenchange', () => this.onFullscreenChange());
    document.addEventListener('MSFullscreenChange', () => this.onFullscreenChange());

    // Close menus when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.qualityMenu.contains(e.target) && !this.qualityBtn.contains(e.target)) {
        this.qualityMenu.classList.remove('show');
      }
      if (!this.settingsMenu.contains(e.target) && !this.settingsBtn.contains(e.target)) {
        this.settingsMenu.classList.remove('show');
      }
    });
  }

  setupHLS() {
    if (!this.options.hlsUrl) {
      this.showError('No video source provided');
      return;
    }

    this.showLoading(true);

    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      this.hls = new Hls({
        enableWorker: false,
        lowLatencyMode: true,
        backBufferLength: 90,
        maxBufferLength: 30,
        maxMaxBufferLength: 60
      });

      this.hls.loadSource(this.options.hlsUrl);
      this.hls.attachMedia(this.video);

      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        this.onManifestParsed();
      });

      this.hls.on(Hls.Events.LEVEL_LOADED, () => {
        this.updateQualityOptions();
      });

      this.hls.on(Hls.Events.ERROR, (event, data) => {
        this.onHLSError(event, data);
      });

    } else if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      this.video.src = this.options.hlsUrl;
      this.video.addEventListener('canplay', () => {
        this.showLoading(false);
      });
    } else {
      this.showError('HLS not supported in this browser');
    }
  }

  setupControlsAutoHide() {
    this.showControlsTemporarily();
  }

  onManifestParsed() {
    this.showLoading(false);
    this.updateQualityOptions();
    
    if (this.options.autoplay) {
      this.play();
    }
  }

  updateQualityOptions() {
    if (!this.hls) return;

    const levels = this.hls.levels;
    this.availableQualities = ['auto', ...levels.map((level, index) => ({
      index,
      height: level.height,
      bitrate: level.bitrate,
      label: `${level.height}p`
    }))];

    // Update quality menu
    this.qualityMenu.innerHTML = this.availableQualities.map(quality => {
      const isAuto = quality === 'auto';
      const isActive = (isAuto && this.currentQuality === 'auto') || 
                      (!isAuto && this.currentQuality === quality.index);
      
      return `
        <div class="quality-option ${isActive ? 'active' : ''}" data-quality="${isAuto ? 'auto' : quality.index}">
          <span>${isAuto ? 'Auto' : quality.label}</span>
          ${isActive ? `<svg class="checkmark" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>` : ''}
        </div>
      `;
    }).join('');

    // Add click listeners to quality options
    this.container.querySelectorAll('.quality-option').forEach(option => {
      option.addEventListener('click', (e) => {
        const quality = e.currentTarget.dataset.quality;
        this.setQuality(quality);
      });
    });
  }

  setQuality(quality) {
    if (!this.hls) return;

    if (quality === 'auto') {
      this.hls.currentLevel = -1; // Auto quality
      this.currentQuality = 'auto';
      this.qualityBtn.querySelector('.quality-text').textContent = 'AUTO';
    } else {
      const qualityIndex = parseInt(quality);
      this.hls.currentLevel = qualityIndex;
      this.currentQuality = qualityIndex;
      const level = this.hls.levels[qualityIndex];
      this.qualityBtn.querySelector('.quality-text').textContent = `${level.height}P`;
    }

    // Update active quality option
    this.container.querySelectorAll('.quality-option').forEach(option => {
      option.classList.remove('active');
      const checkmark = option.querySelector('.checkmark');
      if (checkmark) checkmark.remove();
    });

    const activeOption = this.container.querySelector(`[data-quality="${quality}"]`);
    if (activeOption) {
      activeOption.classList.add('active');
      activeOption.innerHTML += `<svg class="checkmark" viewBox="0 0 24 24" fill="currentColor">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
      </svg>`;
    }

    this.qualityMenu.classList.remove('show');
  }

  togglePlayPause() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  async play() {
    try {
      await this.video.play();
    } catch (error) {
      console.error('Play failed:', error);
      this.showError('Failed to play video');
    }
  }

  pause() {
    this.video.pause();
  }

  toggleMute() {
    this.video.muted = !this.video.muted;
  }

  setVolume(volume) {
    this.video.volume = Math.max(0, Math.min(1, volume));
    this.volume = this.video.volume;
  }

  toggleFullscreen() {
    if (!this.isFullscreen) {
      this.enterFullscreen();
    } else {
      this.exitFullscreen();
    }
  }

  enterFullscreen() {
    const element = this.container;
    if (element.requestFullscreen) {
      element.requestFullscreen();
    } else if (element.webkitRequestFullscreen) {
      element.webkitRequestFullscreen();
    } else if (element.mozRequestFullScreen) {
      element.mozRequestFullScreen();
    } else if (element.msRequestFullscreen) {
      element.msRequestFullscreen();
    }
  }

  exitFullscreen() {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  }

  setPlaybackSpeed(speed) {
    this.video.playbackRate = parseFloat(speed);
    this.settingsMenu.classList.remove('show');
  }

  seek(e) {
    const rect = this.progressBar.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const seekTime = percent * this.duration;
    this.video.currentTime = seekTime;
  }

  startSeeking(e) {
    const onMouseMove = (e) => this.seek(e);
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    this.seek(e);
  }

  toggleQualityMenu() {
    this.qualityMenu.classList.toggle('show');
    this.settingsMenu.classList.remove('show');
  }

  toggleSettingsMenu() {
    this.settingsMenu.classList.toggle('show');
    this.qualityMenu.classList.remove('show');
  }

  showControlsTemporarily() {
    this.showControls = true;
    this.controls.classList.add('show');
    this.container.classList.remove('controls-hidden');
    
    clearTimeout(this.controlsTimeout);
    this.controlsTimeout = setTimeout(() => {
      if (this.isPlaying && !this.isFullscreen) {
        this.hideControls();
      }
    }, 3000);
  }

  hideControls() {
    this.showControls = false;
    this.controls.classList.remove('show');
    this.container.classList.add('controls-hidden');
    this.qualityMenu.classList.remove('show');
    this.settingsMenu.classList.remove('show');
  }

  showLoading(show) {
    this.loadingIndicator.classList.toggle('hidden', !show);
  }

  showError(message) {
    this.errorDisplay.querySelector('p').textContent = message;
    this.errorDisplay.classList.remove('hidden');
    this.showLoading(false);
  }

  formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  // Event handlers
  onLoadedMetadata() {
    this.duration = this.video.duration;
    this.durationDisplay.textContent = this.formatTime(this.duration);
  }

  onTimeUpdate() {
    this.currentTime = this.video.currentTime;
    this.currentTimeDisplay.textContent = this.formatTime(this.currentTime);
    
    // Update progress bar
    if (this.duration > 0) {
      const percent = (this.currentTime / this.duration) * 100;
      this.progressPlayed.style.width = `${percent}%`;
      this.progressHandle.style.left = `${percent}%`;
    }
  }

  onProgress() {
    if (this.video.buffered.length > 0) {
      const bufferedEnd = this.video.buffered.end(this.video.buffered.length - 1);
      const percent = (bufferedEnd / this.duration) * 100;
      this.progressBuffer.style.width = `${percent}%`;
    }
  }

  onPlay() {
    this.isPlaying = true;
    this.bigPlayButton.classList.add('hidden');
    this.playPauseBtn.querySelector('.play-icon').classList.add('hidden');
    this.playPauseBtn.querySelector('.pause-icon').classList.remove('hidden');
    this.container.classList.add('playing');
  }

  onPause() {
    this.isPlaying = false;
    this.bigPlayButton.classList.remove('hidden');
    this.playPauseBtn.querySelector('.play-icon').classList.remove('hidden');
    this.playPauseBtn.querySelector('.pause-icon').classList.add('hidden');
    this.container.classList.remove('playing');
    this.showControlsTemporarily();
  }

  onEnded() {
    this.isPlaying = false;
    this.bigPlayButton.classList.remove('hidden');
    this.playPauseBtn.querySelector('.play-icon').classList.remove('hidden');
    this.playPauseBtn.querySelector('.pause-icon').classList.add('hidden');
    this.container.classList.remove('playing');
    this.showControlsTemporarily();
  }

  onWaiting() {
    this.showLoading(true);
  }

  onPlaying() {
    this.showLoading(false);
  }

  onError() {
    this.showError('Failed to load video');
  }

  onVolumeChange() {
    this.isMuted = this.video.muted;
    this.volume = this.video.volume;
    this.volumeSlider.value = this.video.muted ? 0 : this.video.volume * 100;
    
    // Update volume icon
    const highIcon = this.volumeBtn.querySelector('.volume-high-icon');
    const mutedIcon = this.volumeBtn.querySelector('.volume-muted-icon');
    
    if (this.video.muted || this.video.volume === 0) {
      highIcon.classList.add('hidden');
      mutedIcon.classList.remove('hidden');
    } else {
      highIcon.classList.remove('hidden');
      mutedIcon.classList.add('hidden');
    }
  }

  onFullscreenChange() {
    this.isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || 
                          document.mozFullScreenElement || document.msFullscreenElement);
    
    const enterIcon = this.fullscreenBtn.querySelector('.fullscreen-enter-icon');
    const exitIcon = this.fullscreenBtn.querySelector('.fullscreen-exit-icon');
    
    if (this.isFullscreen) {
      enterIcon.classList.add('hidden');
      exitIcon.classList.remove('hidden');
      this.container.classList.add('fullscreen');
    } else {
      enterIcon.classList.remove('hidden');
      exitIcon.classList.add('hidden');
      this.container.classList.remove('fullscreen');
    }
  }

  onPlayerClick(e) {
    // Don't toggle play/pause if clicking on controls
    if (e.target.closest('.video-controls') || e.target.closest('.quality-menu') || e.target.closest('.settings-menu')) {
      return;
    }
    
    this.togglePlayPause();
  }

  onKeydown(e) {
    // Only handle keyboard shortcuts when player is focused or active
    if (!this.container.contains(document.activeElement) && document.activeElement !== document.body) {
      return;
    }

    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault();
        this.togglePlayPause();
        break;
      case 'f':
        e.preventDefault();
        this.toggleFullscreen();
        break;
      case 'm':
        e.preventDefault();
        this.toggleMute();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this.video.currentTime = Math.max(0, this.video.currentTime - 10);
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.video.currentTime = Math.min(this.duration, this.video.currentTime + 10);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.setVolume(Math.min(1, this.video.volume + 0.1));
        break;
      case 'ArrowDown':
        e.preventDefault();
        this.setVolume(Math.max(0, this.video.volume - 0.1));
        break;
    }
  }

  onHLSError(event, data) {
    console.error('HLS Error:', data);
    
    if (data.fatal) {
      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR:
          console.log('Network error, trying to recover...');
          this.hls.startLoad();
          break;
        case Hls.ErrorTypes.MEDIA_ERROR:
          console.log('Media error, trying to recover...');
          this.hls.recoverMediaError();
          break;
        default:
          console.log('Fatal error, destroying HLS instance');
          this.showError('Fatal playback error occurred');
          this.hls.destroy();
          break;
      }
    }
  }

  // Public methods
  destroy() {
    if (this.hls) {
      this.hls.destroy();
    }
    clearTimeout(this.controlsTimeout);
  }

  getCurrentTime() {
    return this.video.currentTime;
  }

  getDuration() {
    return this.video.duration;
  }

  getVolume() {
    return this.video.volume;
  }

  isPaused() {
    return this.video.paused;
  }
}

// CSS for the advanced video player will be added via the main CSS file
// Export for global usage
window.AdvancedVideoPlayer = AdvancedVideoPlayer;
