"use client";

import { useState } from "react";

export function TeamPhotoCarousel({ photos, teamNumber }: { photos: string[]; teamNumber: number }) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (!photos.length) return <div className="team-photo-empty"><strong>No pit photos yet</strong><span>Photos submitted from pit scouting will appear here.</span></div>;

  const photoCount = photos.length;
  const displayedIndex = Math.min(activeIndex, photoCount - 1);
  const previous = () => setActiveIndex((index) => (index - 1 + photoCount) % photoCount);
  const next = () => setActiveIndex((index) => (index + 1) % photoCount);

  return <figure className="team-photo-carousel">
    {/* Signed Supabase URLs cannot use the static Next image optimizer. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={photos[displayedIndex]} alt={`${teamNumber} robot pit photo ${displayedIndex + 1} of ${photoCount}`} />
    {photoCount > 1 && <figcaption className="team-photo-controls"><button type="button" onClick={previous} aria-label="Show previous robot photo">Previous</button><span aria-live="polite">Photo {displayedIndex + 1} of {photoCount}</span><button type="button" onClick={next} aria-label="Show next robot photo">Next</button></figcaption>}
  </figure>;
}
