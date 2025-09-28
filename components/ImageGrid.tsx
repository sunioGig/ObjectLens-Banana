import React from 'react';
import type { ImageJob } from '../types';
import { Trash2, RefreshCw, AlertTriangle, Image as ImageIcon } from 'lucide-react';

const DotLoader: React.FC = () => (
    <div className="text-center font-mono text-black">
        <div className="text-2xl tracking-widest animate-pulse pb-1">...</div>
    </div>
);

const ImageThumbnail: React.FC<{
  job: ImageJob;
  isSelected: boolean;
  onSelect: () => void;
}> = ({ job, isSelected, onSelect }) => {
  const content = () => {
    switch (job.status) {
      case 'generating':
        return (
          <div className="w-full h-full flex items-center justify-center bg-gray-100">
            <DotLoader />
          </div>
        );
      case 'completed':
        const displayResult = job.results[0];
        if (displayResult) {
            return (
              <img src={displayResult.imageData} alt="Generated content" className="w-full h-full object-cover" />
            );
        }
        return (
             <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 text-gray-400">
               <ImageIcon size={32} />
               <p className="mt-2 text-sm">No image</p>
            </div>
        )
    }
  };

  return (
    <div
      onClick={onSelect}
      className={`relative w-full h-full overflow-hidden cursor-pointer transition-all duration-200 aspect-square ${
        isSelected ? 'border-2 border-blue-500' : 'border border-gray-300 hover:border-black'
      }`}
    >
      {content()}
    </div>
  );
};


export const ImageGrid: React.FC<{
  jobs: ImageJob[];
  selectedJobId: string | null;
  onSelectJob: (id: string) => void;
  layout?: 'desktop' | 'mobile';
}> = ({ jobs, selectedJobId, onSelectJob, layout = 'desktop' }) => {

  if (jobs.length === 0) {
    if (layout === 'mobile') {
        // Render a placeholder to establish the keyline even when empty
        return <div className="bg-white border-t border-black p-2 h-24" />;
    }
    return (
        <div className="flex flex-col items-center justify-center h-full text-gray-400 text-center p-4">
            <p className="text-sm text-gray-500">
                Take a picture or upload
                <br />
                an image of an object.
            </p>
        </div>
    )
  }

  if (layout === 'mobile') {
    return (
        <div className="bg-white border-t border-black p-2">
            <div className="flex overflow-x-auto space-x-2">
                {jobs.map(job => (
                    <div key={job.id} className="flex-shrink-0 w-20 h-20">
                        <ImageThumbnail
                            job={job}
                            isSelected={job.id === selectedJobId}
                            onSelect={() => onSelectJob(job.id)}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
  }

  // Desktop layout (default)
  return (
    <div className="grid grid-cols-3 gap-2">
      {jobs.map(job => (
        <ImageThumbnail
          key={job.id}
          job={job}
          isSelected={job.id === selectedJobId}
          onSelect={() => onSelectJob(job.id)}
        />
      ))}
    </div>
  );
};