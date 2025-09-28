import React, { useRef } from 'react';
import { Camera, Upload } from 'lucide-react';

export const ActionFooter: React.FC<{
  onImageReady: (file: File) => void;
  isCameraOpen: boolean;
  setIsCameraOpen: React.Dispatch<React.SetStateAction<boolean>>;
}> = ({ onImageReady, isCameraOpen, setIsCameraOpen }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      onImageReady(event.target.files[0]);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };
  
  return (
    <div className="relative flex-shrink-0">
      <div className="border-t border-black bg-white">
        <div className="flex items-center justify-center h-16">
            <button
                onClick={() => setIsCameraOpen(prev => !prev)}
                className={`flex-1 h-full flex items-center justify-center transition-colors ${isCameraOpen ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-100'}`}
                aria-label={isCameraOpen ? 'Close Camera' : 'Open Camera'}
            >
                <Camera size={24} />
            </button>
            <div className="w-px h-full bg-black"></div>
            <button
                onClick={handleUploadClick}
                className="flex-1 h-full flex items-center justify-center bg-white hover:bg-gray-100 transition-colors"
                aria-label="Upload Image"
            >
                <Upload size={24} />
            </button>
        </div>
      </div>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="image/*"
      />
    </div>
  );
};