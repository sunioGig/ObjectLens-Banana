import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { ImageJob, JobResult } from '../types';
import { PRESET_PROMPTS } from '../constants';
import { generateProductImage } from '../services/geminiService';
import { ChevronLeft, ChevronRight, Trash2, Download, Code } from 'lucide-react';

// Declare the GIF library loaded from the script tag in index.html
declare var GIF: any;

export const MainViewer: React.FC<{
  job: ImageJob | null;
  setImageJobs: React.Dispatch<React.SetStateAction<ImageJob[]>>;
  concurrentRequests: number;
  setConcurrentRequests: React.Dispatch<React.SetStateAction<number>>;
  setUserError: React.Dispatch<React.SetStateAction<string | null>>;
}> = ({ job, setImageJobs, concurrentRequests, setConcurrentRequests, setUserError }) => {
  const [remixPrompt, setRemixPrompt] = useState('');
  const [currentResultIndex, setCurrentResultIndex] = useState(0);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const [isGeneratingGif, setIsGeneratingGif] = useState(false);
  const downloadMenuRef = useRef<HTMLDivElement>(null);

  const MAX_CONCURRENT_REQUESTS = 8;

  useEffect(() => {
    if (job && job.results.length > 0) {
      const newIndex = job.results.length - 1;
      if (currentResultIndex !== newIndex) {
         setCurrentResultIndex(newIndex);
      }
    } else {
      setCurrentResultIndex(0);
    }
    setShowPrompt(false);
  }, [job?.id, job?.results.length]);


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
            return;
        }

        if (!job || job.results.length <= 1) return;

        if (e.key === 'ArrowLeft') {
            setCurrentResultIndex(prev => (prev > 0 ? prev - 1 : job.results.length - 1));
        } else if (e.key === 'ArrowRight') {
            setCurrentResultIndex(prev => (prev < job.results.length - 1 ? prev + 1 : 0));
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [job]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(event.target as Node)) {
        setIsDownloadMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);


  const handleRemix = async (promptToUse: string, presetLabel?: string) => {
    if (!job || job.results.length === 0 || !promptToUse.trim()) return;

    if (concurrentRequests >= MAX_CONCURRENT_REQUESTS) {
      setUserError("Hold on! Too many generations in progress.");
      return;
    }

    // If the prompt is coming from the user input (not a preset), clear it.
    if (promptToUse === remixPrompt) {
        setRemixPrompt('');
    }

    if (presetLabel) {
      setImageJobs(prevJobs =>
        prevJobs.map(j =>
          j.id === job.id
            ? { ...j, generatingPresets: [...(j.generatingPresets || []), presetLabel] }
            : j
        )
      );
    }
    setConcurrentRequests(prev => prev + 1);
    try {
      const sourceImageResult = job.results[0]; 
      const sourceImageData = sourceImageResult.imageData;
      const mimeType = sourceImageData.substring(sourceImageData.indexOf(':') + 1, sourceImageData.indexOf(';'));

      const newImage = await generateProductImage(sourceImageData, mimeType, promptToUse);
      const newResult: JobResult = { imageData: newImage, prompt: promptToUse };
      
      setImageJobs(prevJobs =>
        prevJobs.map(j => {
          if (j.id === job.id) {
            const updatedResults = [...j.results, newResult];
            return { ...j, results: updatedResults };
          }
          return j;
        })
      );
    } catch (error) {
      console.error("Remix failed:", error);
      setUserError("System error. Please try again.");
    } finally {
      if (presetLabel) {
        setImageJobs(prevJobs =>
          prevJobs.map(j =>
            j.id === job.id
              ? { ...j, generatingPresets: (j.generatingPresets || []).filter(p => p !== presetLabel) }
              : j
          )
        );
      }
      setConcurrentRequests(prev => prev - 1);
    }
  };
  
    const handleDelete = () => {
        if (!job) return;

        const isDeletingRemix = currentResultIndex > 0;

        if (isDeletingRemix) {
            const newResults = job.results.filter((_, index) => index !== currentResultIndex);
            setImageJobs(prevJobs =>
                prevJobs.map(j =>
                    j.id === job.id ? { ...j, results: newResults } : j
                )
            );
            setCurrentResultIndex(prev => Math.max(0, prev - 1));
        } else {
            setImageJobs(prevJobs => prevJobs.filter(j => j.id !== job.id));
        }
    };
  
  const handleDownloadPng = useCallback(() => {
    if (!job || !job.results[currentResultIndex]) return;
    const link = document.createElement('a');
    link.href = job.results[currentResultIndex].imageData;
    link.download = `objectlens-${job.id}-${currentResultIndex + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [job, currentResultIndex]);
  
  const handleDownloadGif = useCallback(async () => {
    if (!job || job.results.length < 2 || isGeneratingGif) return;

    setIsGeneratingGif(true);
    let workerObjectURL: string | null = null;
    try {
      const workerResponse = await fetch('https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js');
      if (!workerResponse.ok) throw new Error('Failed to fetch GIF worker script');
      const workerScript = await workerResponse.text();
      const workerBlob = new Blob([workerScript], { type: 'application/javascript' });
      workerObjectURL = URL.createObjectURL(workerBlob);

      const gif = new GIF({
        workers: 2,
        quality: 10,
        workerScript: workerObjectURL,
      });

      const imagePromises = job.results.map((result) => {
        return new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous'; 
          img.onload = () => resolve(img);
          img.onerror = (err) => reject(new Error('Failed to load image for GIF: ' + err));
          img.src = result.imageData;
        });
      });

      const images = await Promise.all(imagePromises);

      images.forEach((img) => {
        gif.addFrame(img, { delay: 500 });
      });

      gif.on('finished', (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `objectlens-${job.id}-animation.gif`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setIsGeneratingGif(false);
      });

      gif.render();
    } catch (error) {
      console.error('Error creating GIF:', error);
      alert('An error occurred while creating the GIF. Please check the console for details.');
      setIsGeneratingGif(false);
    } finally {
      if (workerObjectURL) {
        URL.revokeObjectURL(workerObjectURL);
      }
    }
  }, [job, isGeneratingGif]);


  if (!job) {
    // On desktop, the sidebar shows the placeholder text.
    // Return an empty div here to avoid showing it twice.
    return <div className="w-full h-full" />;
  }

  const canNavigate = job.results.length > 1;
  const currentResult = job.results[currentResultIndex];
  const isPromptVisible = showPrompt && currentResult?.prompt;
  const isDeleteDisabled = currentResultIndex === 0 && job.results.length > 1;

  return (
    <div className="p-4 md:p-8 pb-4 h-full flex flex-col space-y-4">
      <div className="relative flex-grow min-h-0 flex items-center justify-center">
        
        {canNavigate && (
          <>
            <button onClick={() => setCurrentResultIndex(prev => (prev > 0 ? prev - 1 : job.results.length - 1))} className="absolute left-4 top-1/2 -translate-y-1/2 bg-white text-black border border-black p-2 hover:bg-gray-100 transition z-20 rounded-none">
              <ChevronLeft />
            </button>
            <button onClick={() => setCurrentResultIndex(prev => (prev < job.results.length - 1 ? prev + 1 : 0))} className="absolute right-4 top-1/2 -translate-y-1/2 bg-white text-black border border-black p-2 hover:bg-gray-100 transition z-20 rounded-none">
              <ChevronRight />
            </button>
          </>
        )}
        
        {job.results.length > 0 && currentResult ? (
          <div className="relative w-auto h-full max-w-full aspect-square">
            <div className="absolute inset-0 bg-white border border-black flex items-center justify-center">
              <img 
                key={`${job.id}-${currentResultIndex}`}
                src={currentResult.imageData} 
                alt={`Result ${currentResultIndex + 1}`} 
                className="max-w-full max-h-full object-contain"
              />
            </div>
            
            {isPromptVisible && (
              <div className="absolute bottom-9 left-0 w-1/2 z-10">
                <div className="bg-black text-white text-xs font-mono p-2 text-left rounded-none">
                  <span className="font-semibold">Prompt: </span>{currentResult.prompt}
                </div>
              </div>
            )}
            
            <div className="absolute bottom-0 left-0 right-0 z-10">
              <div className="flex items-end justify-between">
                  <div className="flex items-stretch">
                      <button 
                          onClick={() => setShowPrompt(p => !p)} 
                          className={`p-2 border border-black transition rounded-none ${showPrompt ? 'bg-black text-white hover:bg-gray-800' : 'bg-white text-black hover:bg-gray-100'}`} 
                          title="Toggle prompt"
                      >
                          <Code size={18}/>
                      </button>
                      {canNavigate && (
                          <div className="bg-white text-black border border-black ml-[-1px] text-xs font-mono px-2 flex items-center rounded-none">
                              {currentResultIndex + 1} / {job.results.length}
                          </div>
                      )}
                  </div>

                  <div className="flex items-stretch">
                      <div className="relative" ref={downloadMenuRef}>
                          <button 
                            onClick={() => setIsDownloadMenuOpen(p => !p)} 
                            className={`p-2 border border-black transition rounded-none ${isDownloadMenuOpen ? 'bg-black text-white hover:bg-black' : 'bg-white text-black hover:bg-gray-100'}`}
                            title="Download"
                          >
                              <Download size={18} />
                          </button>
                          {isDownloadMenuOpen && (
                              <div className="absolute bottom-full right-0 mb-[-1px] w-64 bg-white border border-black shadow-xl z-30 rounded-none">
                              <ul className="text-sm font-mono">
                                  <li>
                                  <button
                                      onClick={() => {
                                      handleDownloadPng();
                                      setIsDownloadMenuOpen(false);
                                      }}
                                      className="w-full text-left px-4 py-2 hover:bg-gray-100 transition rounded-none"
                                  >
                                      Download PNG
                                  </button>
                                  </li>
                                  <li>
                                  <button
                                      onClick={() => {
                                      handleDownloadGif();
                                      setIsDownloadMenuOpen(false);
                                      }}
                                      disabled={job.results.length < 2 || isGeneratingGif}
                                      className="w-full text-left px-4 py-2 hover:bg-gray-100 transition border-t border-black disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed rounded-none"
                                  >
                                      {isGeneratingGif ? 'Making GIF...' : 'Download GIF'}
                                  </button>
                                  </li>
                              </ul>
                              </div>
                          )}
                      </div>
                      <button 
                          onClick={handleDelete}
                          disabled={isDeleteDisabled}
                          className="p-2 border border-black ml-[-1px] bg-white hover:bg-gray-200 transition rounded-none disabled:bg-white disabled:text-gray-300 disabled:border-gray-300 disabled:cursor-not-allowed" 
                          title={isDeleteDisabled ? "Delete all remixes before deleting the base image" : "Delete this image"}
                      >
                          <Trash2 size={18}/>
                      </button>
                  </div>
              </div>
            </div>
          </div>
        ) : (
            null
        )}
        {concurrentRequests > 0 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
            <div className="bg-black text-white text-xs font-mono py-1 px-3 animate-pulse rounded-none">
                Generating...
            </div>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 space-y-4">
        <div className="relative flex w-full items-center">
            <input
                type="text"
                disabled={job.status === 'generating'}
                value={remixPrompt}
                onChange={(e) => setRemixPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRemix(remixPrompt)}
                placeholder="Create new shot ..."
                className="w-full bg-white border border-black py-3 pl-4 pr-14 text-black placeholder-gray-500 transition rounded-none disabled:bg-white disabled:border-gray-300 disabled:placeholder-gray-400 disabled:cursor-not-allowed focus:ring-1 focus:ring-black"
            />
            <button
                onClick={() => handleRemix(remixPrompt)}
                disabled={!remixPrompt.trim() || job.status === 'generating'}
                className="absolute top-1/2 right-2 -translate-y-1/2 flex h-9 w-9 items-center justify-center bg-white text-black border border-black hover:bg-gray-100 disabled:bg-white disabled:text-gray-300 disabled:border-gray-300 disabled:cursor-not-allowed transition rounded-none"
                aria-label="Submit remix prompt"
            >
                <ChevronRight size={20} />
            </button>
        </div>
        <div className="space-y-2">
            <div className="flex gap-2 overflow-x-auto pb-2">
            {PRESET_PROMPTS.map(({ label, prompt }) => (
                <button
                key={label}
                onClick={() => handleRemix(prompt, label)}
                className="px-3 py-1.5 bg-white text-black border border-black text-xs hover:bg-gray-100 disabled:text-gray-400 disabled:border-gray-300 disabled:hover:bg-white disabled:cursor-not-allowed transition rounded-none flex-shrink-0"
                disabled={!job || job.results.length === 0 || (job.generatingPresets && job.generatingPresets.includes(label))}
                >
                {label}
                </button>
            ))}
            </div>
        </div>
      </div>
    </div>
  );
};