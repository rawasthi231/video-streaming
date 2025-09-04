/**
 * Main Application JavaScript
 * Handles page rendering, routing, and user interactions
 */

class VideoStreamingApp {
  constructor() {
    this.videos = [];
    this.currentPage = 1;
    this.videosPerPage = 20;
    this.totalPages = 1;
    this.searchQuery = '';
    this.selectedCategory = 'all';
    
    this.init();
  }

  /**
   * Initialize the application
   */
  async init() {
    this.setupRoutes();
    this.setupEventListeners();
    
    // Handle initial route
    const currentPath = window.location.pathname;
    router.handleRoute(currentPath);
  }

  /**
   * Setup client-side routes
   */
  setupRoutes() {
    router.register('/', () => this.renderHomePage());
    router.register('/videos', () => this.renderVideosPage());
    router.register('/upload', () => this.renderUploadPage());
    router.register('/watch/:id', (id) => this.renderVideoPlayer(id));
  }

  /**
   * Setup global event listeners
   */
  setupEventListeners() {
    // Handle navigation clicks
    // Use closest() so clicks on child elements (icons, images, svg) still trigger navigation
    document.addEventListener('click', (e) => {
      const navEl = e.target.closest && e.target.closest('[data-navigate]');
      if (navEl) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const path = navEl.getAttribute('data-navigate') || navEl.getAttribute('href');
        if (path) router.navigate(path);
        return;
      }
    });

    // Mobile menu toggle
    document.addEventListener('click', (e) => {
      if (e.target.matches('.mobile-menu-toggle')) {
        const navLinks = document.querySelector('.nav-links');
        navLinks.classList.toggle('show');
      }
    });

    // Handle clicks on video thumbnails / play overlay inside cards to navigate to watch page
    document.addEventListener('click', (e) => {
      const thumbEl = e.target.closest && e.target.closest('.video-card');
      if (!thumbEl) return;

      // If the card itself (or any child) has a data-navigate attribute this will be handled by the
      // previous listener. This handler ensures that clicking anywhere on the thumbnail (image or play)
      // navigates to the watch page even if markup changes.
      const path = thumbEl.getAttribute('data-navigate');
      if (path) {
        // Prevent double-handling if the target is already an anchor
        e.preventDefault();
        router.navigate(path);
      }
    });
  }

  /**
   * Render the home page
   */
  async renderHomePage() {
    try {
      const videosResponse = await api.getVideos(1, 8); // Get first 8 videos for hero
  const videos = videosResponse.data || [];

  // Prefer a completed video as the featured video so "Watch Now" doesn't attempt
  // to play a video that's still processing. Fallback to the first video if none
  // are marked completed.
  const featuredVideo = videos.find(v => v.processingStatus === 'completed') || videos[0];
      
      document.getElementById('app').innerHTML = `
        <div class="main-content">
          ${this.renderHeroSection(featuredVideo)}
          
          <div class="container">
            <section class="categories-section">
              <h2 class="section-title">🎬 Latest Videos</h2>
              <div class="video-grid" id="home-videos">
                ${this.renderVideoGrid(videos.slice(0, 6))}
              </div>
              
              <div class="text-center">
                <a href="/videos" class="btn btn-primary" data-navigate="/videos">
                  View All Videos
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
                  </svg>
                </a>
              </div>
            </section>
          </div>
        </div>
      `;
    } catch (error) {
      console.error('Failed to load home page:', error);
      this.renderErrorPage('Failed to load home page');
    }
  }

  /**
   * Render the videos listing page
   */
  async renderVideosPage() {
    try {
      await this.loadVideos();
      
      document.getElementById('app').innerHTML = `
        <div class="main-content">
          ${this.renderSearchSection()}
          
          <div class="container">
            <section class="categories-section">
              <h2 class="section-title">🎬 All Videos</h2>
              
              ${this.renderCategoryTabs()}
              
              <div class="video-grid" id="videos-grid">
                ${this.renderVideoGrid(this.videos)}
              </div>
              
              ${this.renderPagination()}
            </section>
          </div>
        </div>
      `;
      
      this.setupVideosPageListeners();
    } catch (error) {
      console.error('Failed to load videos page:', error);
      this.renderErrorPage('Failed to load videos');
    }
  }

  /**
   * Render the upload page
   */
  renderUploadPage() {
    document.getElementById('app').innerHTML = `
      <div class="main-content">
        <div class="upload-container">
          <h1 class="text-center mb-xl">📤 Upload Video</h1>
          
          <form id="upload-form" enctype="multipart/form-data">
            <div class="upload-area" id="upload-area">
              <div class="upload-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
                </svg>
              </div>
              <div class="upload-text">Drop your video here or click to browse</div>
              <div class="upload-subtext">Supports MP4, WebM, MKV, AVI, MOV up to 1GB</div>
              <input type="file" class="file-input" id="video-file" name="video" accept="video/*" required>
            </div>
            
            <div class="upload-form">
              <div class="form-group">
                <label class="form-label" for="video-title">Video Title *</label>
                <input type="text" class="form-input" id="video-title" name="title" required>
              </div>
              
              <div class="form-group">
                <label class="form-label" for="video-description">Description</label>
                <textarea class="form-textarea" id="video-description" name="description" placeholder="Enter video description..."></textarea>
              </div>
              
              <div class="progress-container" id="progress-container">
                <div class="progress-bar">
                  <div class="progress-fill" id="progress-fill"></div>
                </div>
                <div class="progress-text" id="progress-text">0%</div>
              </div>
              
              <div class="text-center">
                <button type="submit" class="btn btn-primary" id="upload-btn">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/>
                  </svg>
                  Upload Video
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    `;
    
    this.setupUploadPageListeners();
  }

  /**
   * Render video player page
   */
  async renderVideoPlayer(videoId) {
    try {
      const response = await api.getVideoById(videoId);
      console.log(response);
      const video = response.data;
      console.log(video);      
      if (!video) {
        this.renderErrorPage('Video not found');
        return;
      }
      
      document.getElementById('app').innerHTML = `
        <div class="main-content">
          <div class="video-player-container">
            <div class="video-player-wrapper">
              <div class="video-player" id="advanced-video-container">
                <!-- Advanced video player will be inserted here -->
              </div>
              
              <div class="video-details">
                <div class="d-flex justify-between align-center mb-lg">
                  <h1>${video.originalName || video.filename}</h1>
                  <span class="status-badge status-${video.processingStatus || 'completed'}">
                    ${(video.processingStatus || 'completed').toUpperCase()}
                  </span>
                </div>
                
                <p class="text-secondary mb-lg">
                  ${video.description || 'No description available.'}
                </p>
                
                <div class="video-stats">
                  <div class="stat-item">
                    <span class="stat-label">Duration</span>
                    <span class="stat-value">${ApiUtils.formatDuration(video.duration)}</span>
                  </div>
                  <div class="stat-item">
                    <span class="stat-label">Resolution</span>
                    <span class="stat-value">${video.width}x${video.height}</span>
                  </div>
                  <div class="stat-item">
                    <span class="stat-label">Size</span>
                    <span class="stat-value">${ApiUtils.formatFileSize(video.size)}</span>
                  </div>
                  <div class="stat-item">
                    <span class="stat-label">Format</span>
                    <span class="stat-value">${video.format?.toUpperCase()}</span>
                  </div>
                  <div class="stat-item">
                    <span class="stat-label">Uploaded</span>
                    <span class="stat-value">${ApiUtils.formatRelativeTime(video.createdAt)}</span>
                  </div>
                </div>
                
                <div class="d-flex gap-md" style="margin-top: var(--spacing-xl);">
                  <a href="/videos" class="btn btn-secondary" data-navigate="/videos">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                    </svg>
                    Back to Videos
                  </a>
                  <button class="btn btn-primary" onclick="navigator.share ? navigator.share({title: '${video.originalName}', url: window.location.href}) : navigator.clipboard.writeText(window.location.href).then(() => NotificationManager.success('Link copied to clipboard'))">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.50-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
                    </svg>
                    Share
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      
      this.setupAdvancedVideoPlayer(video);
    } catch (error) {
      console.error('Failed to load video player:', error);
      this.renderErrorPage('Failed to load video');
    }
  }

  /**
   * Setup HLS video player (legacy method)
   */
  setupVideoPlayer() {
    const video = document.getElementById('video-player');
    const sourceElement = video.querySelector('source');
    const videoSrc = sourceElement ? sourceElement.src : '/video/master.m3u8';
    
    // Check if HLS.js is supported
    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: false, // Disable workers to avoid CSP issues
        lowLatencyMode: true,
        backBufferLength: 90
      });
      
      hls.loadSource(videoSrc);
      hls.attachMedia(video);
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('HLS manifest loaded successfully');
      });
      
      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('HLS Error:', data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log('Network error, trying to recover...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('Media error, trying to recover...');
              hls.recoverMediaError();
              break;
            default:
              console.log('Fatal error, destroying HLS instance');
              hls.destroy();
              // Fallback to native video element
              video.src = videoSrc;
              NotificationManager.warning('Switched to basic video playback');
              break;
          }
        }
      });
      
      // Store HLS instance for cleanup
      video.hlsInstance = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      video.src = videoSrc;
    } else {
      // Fallback for browsers without HLS support
      video.src = videoSrc;
      NotificationManager.warning('Using basic video playback (HLS not supported)');
    }
  }

  /**
   * Setup Advanced Video Player with quality switching and Hotstar-like controls
   */
  setupAdvancedVideoPlayer(video) {
    const container = document.getElementById('advanced-video-container');
    
    if (!container) {
      console.error('Advanced video container not found');
      return;
    }

    // Check if AdvancedVideoPlayer is available
    if (typeof AdvancedVideoPlayer === 'undefined') {
      console.error('AdvancedVideoPlayer not loaded');
      // Fallback to basic video player
      container.innerHTML = `
        <video 
          id="fallback-video-player" 
          controls 
          autoplay 
          width="100%" 
          style="background: #000;"
          poster="${this.generateThumbnailUrl(video)}">
          <source src="${video.hlsPath || '/video/master.m3u8'}" type="application/vnd.apple.mpegurl">
          <p>Your browser does not support HLS video streaming.</p>
        </video>
      `;
      return;
    }

    // Create the advanced video player
    this.currentVideoPlayer = new AdvancedVideoPlayer(container, {
      hlsUrl: video.hlsPath || '/video/master.m3u8',
      poster: this.generateThumbnailUrl(video),
      title: video.originalName || video.filename,
      autoplay: false
    });

    console.log('Advanced video player initialized for video:', video.id);
  }

  /**
   * Load videos from API
   */
  async loadVideos(page = 1) {
    try {
      const response = await api.getVideos(page, this.videosPerPage);
      this.videos = response.data || [];
      this.currentPage = response.meta?.pagination?.page || 1;
      this.totalPages = response.meta?.pagination?.totalPages || 1;
      
      return this.videos;
    } catch (error) {
      console.error('Failed to load videos:', error);
      NotificationManager.error('Failed to load videos');
      return [];
    }
  }

  /**
   * Render hero section
   */
  renderHeroSection(featuredVideo) {
    if (!featuredVideo) {
      return `
        <section class="hero">
          <div class="hero-content">
            <div class="container">
              <h1>🎥 Video Streaming Platform</h1>
              <p>Experience seamless video streaming with auto-scaling capabilities powered by Kubernetes</p>
              <div class="d-flex justify-center gap-md">
                <a href="/videos" class="btn btn-primary" data-navigate="/videos">Browse Videos</a>
                <a href="/upload" class="btn btn-secondary" data-navigate="/upload">Upload Video</a>
              </div>
            </div>
          </div>
        </section>
      `;
    }
    
    return `
      <section class="hero">
        <div class="hero-content">
          <div class="container">
            <h1>🎥 ${featuredVideo.originalName || 'Featured Video'}</h1>
            <p>Experience seamless video streaming with auto-scaling capabilities</p>
            <div class="d-flex justify-center gap-md">
              <a href="/watch/${featuredVideo.id}" class="btn btn-primary" data-navigate="/watch/${featuredVideo.id}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
                Watch Now
              </a>
              <a href="/videos" class="btn btn-secondary" data-navigate="/videos">Browse All</a>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  /**
   * Render search section
   */
  renderSearchSection() {
    return `
      <section class="search-section">
        <div class="container">
          <div class="search-container">
            <input 
              type="text" 
              class="search-input" 
              placeholder="Search videos..." 
              id="search-input"
              value="${this.searchQuery}"
            >
            <select class="filter-dropdown" id="category-filter">
              <option value="all">All Categories</option>
              <option value="recent">Recently Added</option>
              <option value="popular">Most Popular</option>
            </select>
          </div>
        </div>
      </section>
    `;
  }

  /**
   * Render category tabs
   */
  renderCategoryTabs() {
    const categories = [
      { id: 'all', name: 'All Videos', icon: '🎬' },
      { id: 'recent', name: 'Recently Added', icon: '🆕' },
      { id: 'processing', name: 'Processing', icon: '⚙️' },
      { id: 'completed', name: 'Ready to Watch', icon: '✅' }
    ];
    
    return `
      <div class="category-tabs">
        ${categories.map(cat => `
          <button class="category-tab ${this.selectedCategory === cat.id ? 'active' : ''}" 
                  data-category="${cat.id}">
            ${cat.icon} ${cat.name}
          </button>
        `).join('')}
      </div>
    `;
  }

  /**
   * Render video grid
   */
  renderVideoGrid(videos) {
    if (!videos || videos.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
          </div>
          <h3>No videos found</h3>
          <p>Upload your first video to get started</p>
          <a href="/upload" class="btn btn-primary" data-navigate="/upload">Upload Video</a>
        </div>
      `;
    }
    
    return videos.map(video => this.renderVideoCard(video)).join('');
  }

  /**
   * Render individual video card
   */
  renderVideoCard(video) {
    return `
      <div class="video-card" data-navigate="/watch/${video.id}">
        <div class="video-thumbnail">
          <img src="${this.generateThumbnailUrl(video)}" alt="${video.originalName}" loading="lazy">
          <div class="play-overlay">
            <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </div>
        <div class="video-info">
          <h3 class="video-title">${video.originalName || video.filename}</h3>
          <div class="video-meta">
            <span>${ApiUtils.formatRelativeTime(video.createdAt)}</span>
            <span class="duration">${ApiUtils.formatDuration(video.duration)}</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render pagination
   */
  renderPagination() {
    if (this.totalPages <= 1) return '';
    
    const prevDisabled = this.currentPage === 1;
    const nextDisabled = this.currentPage === this.totalPages;
    
    return `
      <div class="d-flex justify-center align-center gap-md" style="margin-top: var(--spacing-xl);">
        <button class="btn btn-secondary" ${prevDisabled ? 'disabled' : ''} onclick="app.changePage(${this.currentPage - 1})">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
          </svg>
          Previous
        </button>
        
        <span class="text-secondary">
          Page ${this.currentPage} of ${this.totalPages}
        </span>
        
        <button class="btn btn-secondary" ${nextDisabled ? 'disabled' : ''} onclick="app.changePage(${this.currentPage + 1})">
          Next
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
          </svg>
        </button>
      </div>
    `;
  }

  /**
   * Setup upload page event listeners
   */
  setupUploadPageListeners() {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('video-file');
    const uploadForm = document.getElementById('upload-form');
    
    // Drag and drop functionality
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      uploadArea.addEventListener(eventName, this.preventDefaults, false);
    });
    
    ['dragenter', 'dragover'].forEach(eventName => {
      uploadArea.addEventListener(eventName, () => uploadArea.classList.add('dragover'), false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
      uploadArea.addEventListener(eventName, () => uploadArea.classList.remove('dragover'), false);
    });
    
    uploadArea.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        fileInput.files = files;
        this.handleFileSelection(files[0]);
      }
    });
    
    // File input change
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.handleFileSelection(e.target.files[0]);
      }
    });
    
    // Form submission
    uploadForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleVideoUpload();
    });
  }

  /**
   * Setup videos page event listeners
   */
  setupVideosPageListeners() {
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');
    
    // Search functionality
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.searchQuery = e.target.value;
        this.filterVideos();
      }, 300);
    });
    
    // Category filter
    categoryFilter.addEventListener('change', (e) => {
      this.selectedCategory = e.target.value;
      this.filterVideos();
    });
    
    // Category tabs
    document.querySelectorAll('[data-category]').forEach(tab => {
      tab.addEventListener('click', (e) => {
        this.selectedCategory = e.target.dataset.category;
        this.filterVideos();
        
        // Update active tab
        document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
      });
    });
  }

  /**
   * Handle file selection
   */
  handleFileSelection(file) {
    const validation = ApiUtils.validateVideoFile(file);
    
    if (!validation.isValid) {
      NotificationManager.error(validation.errors.join('. '));
      return;
    }
    
    // Auto-fill title if empty
    const titleInput = document.getElementById('video-title');
    if (!titleInput.value) {
      titleInput.value = file.name.replace(/\.[^/.]+$/, '');
    }
    
    NotificationManager.success(`Selected: ${file.name} (${ApiUtils.formatFileSize(file.size)})`);
  }

  /**
   * Handle video upload
   */
  async handleVideoUpload() {
    const form = document.getElementById('upload-form');
    const formData = new FormData(form);
    const uploadBtn = document.getElementById('upload-btn');
    const progressContainer = document.getElementById('progress-container');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    
    // Validate form
    const file = formData.get('video');
    const title = formData.get('title');
    
    if (!file || !title) {
      NotificationManager.error('Please select a video file and enter a title');
      return;
    }
    
    const validation = ApiUtils.validateVideoFile(file);
    if (!validation.isValid) {
      NotificationManager.error(validation.errors.join('. '));
      return;
    }
    
    try {
      // Show progress
      uploadBtn.disabled = true;
      uploadBtn.innerHTML = '<div class="spinner"></div> Uploading...';
      progressContainer.style.display = 'block';
      
      const response = await api.uploadVideo(formData, (percentage) => {
        progressFill.style.width = `${percentage}%`;
        progressText.textContent = `${percentage}%`;
      });
      
      NotificationManager.success('Video uploaded successfully! Processing will begin shortly.');
      
      // Reset form
      form.reset();
      progressContainer.style.display = 'none';
      
      // Navigate to videos page after short delay
      setTimeout(() => {
        router.navigate('/videos');
      }, 2000);
      
    } catch (error) {
      console.error('Upload failed:', error);
      NotificationManager.error(`Upload failed: ${error.message}`);
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/>
        </svg>
        Upload Video
      `;
    }
  }

  /**
   * Filter videos based on search and category
   */
  filterVideos() {
    let filteredVideos = [...this.videos];
    
    // Apply search filter
    if (this.searchQuery) {
      filteredVideos = filteredVideos.filter(video => 
        (video.originalName || video.filename).toLowerCase().includes(this.searchQuery.toLowerCase())
      );
    }
    
    // Apply category filter
    switch (this.selectedCategory) {
      case 'recent':
        filteredVideos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        break;
      case 'processing':
        filteredVideos = filteredVideos.filter(video => video.processingStatus === 'processing');
        break;
      case 'completed':
        filteredVideos = filteredVideos.filter(video => video.processingStatus === 'completed');
        break;
    }
    
    // Update grid
    const videosGrid = document.getElementById('videos-grid');
    if (videosGrid) {
      videosGrid.innerHTML = this.renderVideoGrid(filteredVideos);
    }
  }

  /**
   * Change page for pagination
   */
  async changePage(page) {
    if (page < 1 || page > this.totalPages) return;
    
    await this.loadVideos(page);
    this.renderVideosPage();
  }

  /**
   * Generate thumbnail URL or placeholder
   */
  generateThumbnailUrl(video) {
    // Use actual thumbnail if available, otherwise fallback to placeholder
    if (video.thumbnailPath) {
      return video.thumbnailPath;
    }
    return ApiUtils.generateThumbnailPlaceholder(video.originalName || video.filename);
  }

  /**
   * Prevent default drag behaviors
   */
  preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  /**
   * Render error page
   */
  renderErrorPage(message) {
    document.getElementById('app').innerHTML = `
      <div class="main-content">
        <div class="container">
          <div class="empty-state">
            <div class="empty-state-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
              </svg>
            </div>
            <h2>Something went wrong</h2>
            <p>${message}</p>
            <a href="/" class="btn btn-primary" data-navigate="/">Go Home</a>
          </div>
        </div>
      </div>
    `;
  }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.app = new VideoStreamingApp();
});
