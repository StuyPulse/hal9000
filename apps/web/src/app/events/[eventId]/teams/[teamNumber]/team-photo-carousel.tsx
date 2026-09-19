"use client";

import { useEffect, useState } from "react";

export function TeamPhotoCarousel({ photos, teamNumber }: { photos: string[]; teamNumber: number }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [expanded]);

  if (!photos.length) return <div className="team-photo-empty"><strong>No pit photos yet</strong><span>Photos submitted from pit scouting will appear here.</span></div>;

  const photoCount = photos.length;
  const displayedIndex = Math.min(activeIndex, photoCount - 1);
  const previous = () => setActiveIndex((index) => (index - 1 + photoCount) % photoCount);
  const next = () => setActiveIndex((index) => (index + 1) % photoCount);

  return <figure className="team-photo-carousel">
    {/* Signed Supabase URLs cannot use the static Next image optimizer. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={photos[displayedIndex]} alt={`${teamNumber} robot pit photo ${displayedIndex + 1} of ${photoCount}`} />
    {photoCount > 1 ? <figcaption className="team-photo-controls">
      <button type="button" onClick={previous} aria-label="Show previous robot photo">Previous</button>
      <button type="button" onClick={next} aria-label="Show next robot photo">Next</button>
      <button type="button" className="team-photo-expand" onClick={() => setExpanded(true)}>Expand photo</button>
    </figcaption> : <button type="button" className="team-photo-expand team-photo-expand-solo" onClick={() => setExpanded(true)}>Expand photo</button>}
    {expanded && <div className="team-photo-lightbox" role="dialog" aria-modal="true" aria-label={`Expanded robot photo for team ${teamNumber}`}>
      {/* Signed Supabase URLs cannot use the static Next image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photos[displayedIndex]} alt={`${teamNumber} robot pit photo ${displayedIndex + 1} of ${photoCount}`} />
      <div className="team-photo-lightbox-controls">
        {photoCount > 1 && <button type="button" onClick={previous}>Previous</button>}
        <span aria-live="polite">Photo {displayedIndex + 1} of {photoCount}</span>
        {photoCount > 1 && <button type="button" onClick={next}>Next</button>}
        <button type="button" onClick={() => setExpanded(false)}>Close</button>
      </div>
    </div>}
  </figure>;
}
