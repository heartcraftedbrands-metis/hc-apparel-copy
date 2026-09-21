import React, { useEffect, useState } from 'react';
import { Layers3 } from 'lucide-react';

export default function CatalogEditorialImage({ src, alt, className = '', style, loading = 'lazy' }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={`${alt} visual`}
        className={`flex h-full w-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_78%_18%,rgba(232,169,16,0.32),transparent_30%),linear-gradient(145deg,#637145_0%,#34421f_58%,#1f2b15_100%)] ${className}`}
      >
        <div className="rounded-full border border-white/25 bg-white/10 p-5 text-[#f8f4ee] backdrop-blur-sm">
          <Layers3 className="h-8 w-8" strokeWidth={1.4} />
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      onError={() => setFailed(true)}
      style={style}
      className={`h-full w-full bg-[#e9e1d1] object-cover object-center ${className}`}
    />
  );
}
