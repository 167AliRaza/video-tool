/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Film, Upload, Play, Download, RefreshCw, Zap, Clock, AlertCircle } from 'lucide-react';

const SPEED_PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0];

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [speed, setSpeed] = useState<number>(1.5);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [statusText, setStatusText] = useState<string>('');
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setVideoUrl(URL.createObjectURL(selectedFile));
      setProcessedUrl(null);
      setProgress(0);
      setError(null);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleProcessVideo = async () => {
    if (!file) return;

    setIsProcessing(true);
    setProgress(0);
    setStatusText('Uploading & starting processing...');
    setError(null);
    setProcessedUrl(null);

    const formData = new FormData();
    formData.append('video', file);
    formData.append('speed', speed.toString());

    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to start video processing');
      }

      const { taskId } = await res.json();

      // Poll status
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/status/${taskId}`);
          if (!statusRes.ok) return;
          const task = await statusRes.json();

          setProgress(task.progress);
          setStatusText(task.status);

          if (task.outputUrl) {
            clearInterval(pollInterval);
            setProcessedUrl(task.outputUrl);
            setIsProcessing(false);
          } else if (task.error) {
            clearInterval(pollInterval);
            setError(task.error);
            setIsProcessing(false);
          }
        } catch (err) {
          console.error('Polling error:', err);
        }
      }, 1000);

    } catch (err: any) {
      setError(err.message || 'An error occurred during processing');
      setIsProcessing(false);
    }
  };

  const estimatedDuration = duration ? (duration / speed).toFixed(1) : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center py-8 px-4 font-sans selection:bg-indigo-500 selection:text-white">
      <div className="w-full max-w-md mx-auto space-y-6">
        
        {/* Title */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 mb-1 shadow-lg shadow-indigo-500/10">
            <Film className="w-7 h-7" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
            Video Speed Tool
          </h1>
          <p className="text-sm text-slate-400 max-w-xs mx-auto">
            Speed up or slow down your videos instantly with pitch correction & compression.
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 shadow-2xl space-y-6">
          
          {/* File Upload Section */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Upload Video
            </label>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-indigo-500/60 transition-all rounded-2xl p-6 text-center cursor-pointer bg-slate-950/40 hover:bg-slate-800/30 group"
            >
              <input 
                ref={fileInputRef}
                type="file" 
                accept="video/*" 
                onChange={handleFileChange} 
                className="hidden" 
              />
              <div className="flex flex-col items-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform shadow-md">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-200">
                    {file ? file.name : 'Tap to upload video'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    MP4, MOV, AVI, MKV up to 500MB
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Video Preview */}
          {videoUrl && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold tracking-wider text-slate-400 uppercase">
                Original Preview
              </label>
              <div className="rounded-2xl overflow-hidden border border-slate-800 bg-black aspect-video flex items-center justify-center relative shadow-inner">
                <video 
                  ref={videoRef}
                  src={videoUrl} 
                  controls 
                  onLoadedMetadata={handleLoadedMetadata}
                  className="w-full h-full object-contain"
                />
              </div>
              {duration && (
                <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-indigo-400" />
                    Original: {Math.round(duration)}s
                  </span>
                  {estimatedDuration && (
                    <span className="flex items-center gap-1 text-indigo-300 font-medium">
                      <Zap className="w-3.5 h-3.5" />
                      New Duration: ~{estimatedDuration}s
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Speed Selector */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
                Speed Multiplier
              </label>
              <span className="text-lg font-bold text-indigo-400 font-mono">
                {speed.toFixed(2)}x
              </span>
            </div>

            {/* Range slider */}
            <input 
              type="range" 
              min="0.25" 
              max="4.0" 
              step="0.05" 
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="w-full accent-indigo-500 bg-slate-800 h-2 rounded-lg cursor-pointer"
            />

            {/* Quick preset buttons */}
            <div className="grid grid-cols-4 gap-2 pt-1">
              {SPEED_PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => setSpeed(preset)}
                  className={`py-1.5 px-2 text-xs font-semibold rounded-xl border transition-all ${
                    speed === preset
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {preset}x
                </button>
              ))}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-950/50 border border-red-800/60 rounded-2xl flex items-start space-x-2 text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Processing Progress */}
          {isProcessing && (
            <div className="space-y-2 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
              <div className="flex justify-between text-xs font-medium text-slate-300">
                <span>{statusText}</span>
                <span className="font-mono text-indigo-400">{progress}%</span>
              </div>
              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div 
                  className="bg-indigo-500 h-full transition-all duration-300 rounded-full shadow-[0_0_12px_rgba(99,102,241,0.5)]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Process Button */}
          {file && !processedUrl && !isProcessing && (
            <button
              onClick={handleProcessVideo}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold rounded-2xl shadow-lg shadow-indigo-600/30 transition-all active:scale-[0.98] flex items-center justify-center space-x-2 text-base"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>PROCESS VIDEO</span>
            </button>
          )}

          {/* Processed Video Result */}
          {processedUrl && (
            <div className="space-y-4 pt-2 border-t border-slate-800 animate-fadeIn">
              <div className="space-y-2">
                <label className="block text-xs font-semibold tracking-wider text-emerald-400 uppercase">
                  ✨ Processed Video Ready ({speed}x)
                </label>
                <div className="rounded-2xl overflow-hidden border border-emerald-500/30 bg-black aspect-video flex items-center justify-center relative shadow-xl shadow-emerald-500/5">
                  <video 
                    src={processedUrl} 
                    controls 
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <a
                  href={processedUrl}
                  download="processed_video.mp4"
                  className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/30 transition-all active:scale-[0.98] flex items-center justify-center space-x-2 text-base text-center block"
                >
                  <Download className="w-5 h-5" />
                  <span>DOWNLOAD VIDEO</span>
                </a>

                <button
                  onClick={() => {
                    setFile(null);
                    setVideoUrl(null);
                    setProcessedUrl(null);
                    setProgress(0);
                  }}
                  className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-2xl transition-all flex items-center justify-center space-x-2 text-sm"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Process Another Video</span>
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Footer info */}
        <div className="text-center text-xs text-slate-500 pb-4">
          Powered by FFmpeg & Node.js • Fast & Secure
        </div>

      </div>
    </div>
  );
}
