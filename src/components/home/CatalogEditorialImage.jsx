import React, { useEffect, useMemo, useState } from 'react';

const DEFAULT_PHOTO = '/images/home-catalog/t-shirts-model.jpg';

export default function CatalogEditorialImage({ src, fallbackSrc, alt, className = '', style = {}, loading = 'lazy' }) {
  const candidates = useMemo(
    () => [...new Set([src, fallbackSrc, DEFAULT_PHOTO].filter(Boolean))],
    [src, fallbackSrc],
  );
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => setCandidateIndex(0), [src, fallbackSrc]);

  if (!candidates[candidateIndex]) {
    return (
      <div
        role="img"
        aria-label={`${alt} visual`}
        className={`h-full w-full overflow-hidden bg-[#e9e1d1] ${className}`}
      />
    );
  }

  return (
    <img
      src={candidates[candidateIndex]}
      alt={alt}
      loading={loading === 'eager' ? 'eager' : 'lazy'}
      onError={() => setCandidateIndex(current => current + 1)}
      style={style}
      className={`h-full w-full bg-[#e9e1d1] object-cover object-center ${className}`}
    />
  );
}
