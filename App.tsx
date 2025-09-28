import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ImageJob } from './types';
import { generateProductImage } from './services/geminiService';
import { ActionFooter } from './components/ActionFooter';
import { ImageGrid } from './components/ImageGrid';
import { MainViewer } from './components/MainViewer';
import { X, HelpCircle, RotateCcw, SwitchCamera } from 'lucide-react';

const DEFAULT_PROMPT = "Concisely name the key object in this image. Then generate a clean isolated image of that object on a white background, product photography style shot.";

// Camera View Component (moved from ActionFooter)
const InlineCameraView: React.FC<{
  onCapture: (file: File) => void;
  onClose: () => void;
}> = ({ onCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [isFlashing, setIsFlashing] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const constraints: MediaStreamConstraints = {
        video: { facingMode: facingMode }
      };
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error(`Error accessing camera with mode ${facingMode}:`, err);
       try {
        console.log("Falling back to default camera...");
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = mediaStream;
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (fallbackErr) {
        console.error("Error accessing fallback camera:", fallbackErr);
        alert("Could not access camera. Please check permissions.");
      }
    }
  }, [facingMode]);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);
  
  const handleFlipCamera = () => {
    setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'));
  };

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      setIsFlashing(true);
      setTimeout(() => setIsFlashing(false), 100);

      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      const size = Math.min(videoWidth, videoHeight);
      const sx = (videoWidth - size) / 2;
      const sy = (videoHeight - size) / 2;

      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');

      if (context) {
        context.drawImage(video, sx, sy, size, size, 0, 0, size, size);
        canvas.toBlob(blob => {
          if (blob) {
            const file = new File([blob], `capture-${Date.now()}.png`, { type: 'image/png' });
            onCapture(file);
          }
        }, 'image/png');
      }
    }
  };

  return (
    <div className="relative w-full h-full bg-black">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        <div
          className={`absolute inset-0 bg-black transition-opacity duration-100 ease-out ${
            isFlashing ? 'opacity-90' : 'opacity-0 pointer-events-none'
          }`}
        />
        <canvas ref={canvasRef} className="hidden" />
        <div className="absolute top-2 right-2 z-10 flex items-center space-x-2">
            <button 
                onClick={handleFlipCamera} 
                className="w-10 h-10 rounded-none bg-white border border-black hover:bg-gray-100 transition flex items-center justify-center"
                aria-label="Flip camera"
            >
               <SwitchCamera size={20} />
            </button>
            <button 
                onClick={onClose} 
                className="w-10 h-10 rounded-none bg-white border border-black hover:bg-gray-100 transition flex items-center justify-center"
                aria-label="Close camera"
            >
               <X size={20} />
            </button>
        </div>
        <div className="absolute bottom-4 left-0 right-0 flex justify-center">
            <button 
                onClick={handleCapture} 
                className="w-16 h-16 rounded-full bg-white border border-black hover:bg-gray-100 transition flex items-center justify-center"
                aria-label="Capture image"
            >
               {/* Shutter button is a simple circle */}
            </button>
        </div>
    </div>
  );
};

// Help Modal Component
const HelpModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 cursor-pointer">
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded shadow-xl p-8 w-full max-w-lg border border-black cursor-auto">
        <div className="space-y-4">
          <h1 className="text-xl tracking-wider uppercase text-black">BANANA SCAN v0.1</h1>
          <p className="text-sm text-gray-800">
            This prototype lets you capture things in your physical world and visualize them in new ways. Use your camera or upload an image. <a href="https://ai.studio/apps/drive/1sxJWocoemd8kCp9NqsThpAqOcS9gi8DV" target="_blank" rel="noopener noreferrer" className="underline hover:text-black">Open-source code is available here</a>.
          </p>
        </div>
        <div className="mt-8 text-left">
            <p className="text-xs text-gray-500">
                Built with Gemini 2.5 (Nano Banana) by <a href="https://x.com/alexanderchen" target="_blank" rel="noopener noreferrer" className="underline hover:text-black">@alexanderchen</a>
            </p>
        </div>
      </div>
    </div>
  );
};

// Main App Component
const App: React.FC = () => {
  const [imageJobs, setImageJobs] = useState<ImageJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [concurrentRequests, setConcurrentRequests] = useState(0);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);

  const MAX_CONCURRENT_REQUESTS = 8;

  useEffect(() => {
    if (selectedJobId && !imageJobs.some(job => job.id === selectedJobId)) {
      setSelectedJobId(imageJobs.length > 0 ? imageJobs[0].id : null);
    }
    else if (!selectedJobId && imageJobs.length > 0) {
        setSelectedJobId(imageJobs[0].id);
    }
  }, [imageJobs, selectedJobId]);
  
  const handleCapture = (file: File) => {
    addImageJob(file);
    // Keep camera open
  };

  const handleCloseCamera = () => {
    setIsCameraOpen(false);
  };

  const addImageJob = async (file: File) => {
     if (concurrentRequests >= MAX_CONCURRENT_REQUESTS) {
      setUserError("Hold on! Too many generations in progress.");
      return;
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      const originalImageData = reader.result as string;
      const jobId = `${Date.now()}-${Math.random()}`;
      const newJob: ImageJob = {
        id: jobId,
        originalImage: { data: originalImageData, mimeType: file.type },
        status: 'generating',
        results: [],
        prompt: DEFAULT_PROMPT,
      };

      setImageJobs(prev => [newJob, ...prev]);
      setSelectedJobId(jobId);

      setConcurrentRequests(prev => prev + 1);
      try {
        const generatedImage = await generateProductImage(originalImageData, file.type, DEFAULT_PROMPT);
        setImageJobs(prev =>
          prev.map(job =>
            job.id === jobId ? { ...job, status: 'completed', results: [{ imageData: generatedImage, prompt: DEFAULT_PROMPT }] } : job
          )
        );
      } catch (error) {
        console.error("Image generation failed:", error);
        setUserError("System error. Please try again.");
        setImageJobs(prev => prev.filter(j => j.id !== jobId));
      } finally {
        setConcurrentRequests(prev => prev - 1);
      }
    };
  };
  
  const resetApp = () => {
    setImageJobs([]);
    setSelectedJobId(null);
  };

  const handleSelectJob = (id: string) => {
    // On mobile, if the user selects a thumbnail, close the camera view.
    const isMobile = window.innerWidth < 768; // Tailwind's 'md' breakpoint
    if (isMobile && isCameraOpen) {
      setIsCameraOpen(false);
    }
    setSelectedJobId(id);
  };
  
  const selectedJob = imageJobs.find(job => job.id === selectedJobId) || null;

  const headerContent = (
    <>
      <div className="flex items-center space-x-3">
          <h1 className="text-xl tracking-wider uppercase text-black">Banana Scan</h1>
      </div>
      <div className="flex items-center space-x-4">
        <button onClick={resetApp} className="text-black hover:text-gray-600 transition" aria-label="Reset application">
          <RotateCcw size={18} />
        </button>
        <button onClick={() => setIsHelpOpen(true)} className="text-black hover:text-gray-600 transition" aria-label="About Banana Scan">
              <HelpCircle size={18} />
        </button>
      </div>
    </>
  );

  return (
    <div className="h-screen w-screen bg-white flex flex-col md:flex-row font-mono overflow-hidden" onClick={() => userError && setUserError(null)}>
      {/* --- Desktop Sidebar --- */}
      <aside className="hidden md:flex w-1/3 min-w-[300px] max-w-[450px] h-full flex-col border-r border-black">
        <header className="flex-shrink-0 flex justify-between items-center p-4 border-b border-black">
          {headerContent}
        </header>
        
        <div className="flex-grow p-4 overflow-y-auto">
          <ImageGrid 
            layout="desktop"
            jobs={imageJobs} 
            selectedJobId={selectedJobId} 
            onSelectJob={handleSelectJob}
          />
        </div>
        <div className="relative flex-shrink-0">
            {isCameraOpen && (
                <div className="absolute bottom-full left-0 w-full">
                    <div className="w-full aspect-square border-t border-black">
                        <InlineCameraView 
                            onCapture={handleCapture} 
                            onClose={handleCloseCamera}
                        />
                    </div>
                </div>
            )}
            <ActionFooter 
                onImageReady={addImageJob} 
                isCameraOpen={isCameraOpen}
                setIsCameraOpen={setIsCameraOpen}
            />
        </div>
      </aside>

      {/* --- Mobile View & Desktop Main Content --- */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Mobile Header */}
        <header className="flex-shrink-0 flex justify-between items-center p-4 border-b border-black md:hidden">
            {headerContent}
        </header>

        {/* Main Viewer (shared) */}
        <main className="flex-grow w-full overflow-y-auto min-h-0 relative">
            {userError && (
              <div 
                className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/80 text-white text-xs font-mono p-2 z-40 rounded-none cursor-pointer"
                onClick={(e) => { e.stopPropagation(); setUserError(null); }}
              >
                  {userError}
              </div>
            )}
            <MainViewer 
                job={selectedJob} 
                setImageJobs={setImageJobs}
                concurrentRequests={concurrentRequests}
                setConcurrentRequests={setConcurrentRequests}
                setUserError={setUserError}
            />
            {isCameraOpen && (
                <div className="md:hidden absolute inset-0 z-30 flex items-center justify-center p-4 bg-white">
                    <div className="w-full max-w-full aspect-square">
                        <InlineCameraView onCapture={handleCapture} onClose={handleCloseCamera} />
                    </div>
                </div>
            )}
        </main>

        {/* Mobile Image Grid */}
        <div className="flex-shrink-0 md:hidden">
            <ImageGrid 
                layout="mobile"
                jobs={imageJobs} 
                selectedJobId={selectedJobId} 
                onSelectJob={handleSelectJob}
            />
        </div>
        
        {/* Mobile Action Footer */}
        <div className="flex-shrink-0 md:hidden">
            <ActionFooter 
                onImageReady={addImageJob}
                isCameraOpen={isCameraOpen}
                setIsCameraOpen={setIsCameraOpen}
            />
        </div>
      </div>

      <HelpModal 
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />
    </div>
  );
};

export default App;