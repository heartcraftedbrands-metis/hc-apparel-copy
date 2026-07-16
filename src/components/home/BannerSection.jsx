import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";

export default function BannerSection() {
  const navigate = useNavigate();
  return (
    <div className="relative w-full h-[500px] md:h-[600px] overflow-hidden">
      <img
        src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69889c36f99d1de4b17edfa4/bae687835_image_1.png"
        alt="HC Apparel Banner"
        className="w-full h-full object-cover object-top"
      />
      <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-center px-4">
        <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 drop-shadow-lg">
          Welcome to HC Apparel
        </h1>
        <p className="text-lg md:text-2xl text-white/90 mb-8 max-w-xl drop-shadow">
          Premium digital designs & quality garment blanks for your creative projects
        </p>
        <Button
          size="lg"
          className="bg-white text-black hover:bg-gray-100 font-semibold text-base px-8"
          onClick={() => navigate('/Shop')}
        >
          Shop Now
        </Button>
      </div>
    </div>
  );
}