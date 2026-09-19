"use client";

import { useRef, useState } from "react";

type PreScoutRow = {
  id: string;
  teamNumber: number | string;
  teamName: string;
  autos: string;
  activeShift: string;
  inactiveShift: string;
  traversal: string;
  averagePieces: string;
  withThem: string;
  againstThem: string;
};

const columns = [
  ["team", "Team", 180], ["autos", "Auto", 290], ["activeShift", "Active HUB", 290], ["inactiveShift", "Inactive HUB", 290],
  ["traversal", "Traversal", 250], ["averagePieces", "Average fuel", 150], ["withThem", "With them", 290], ["againstThem", "Against them", 290],
] as const;

export function PreScoutTable({ rows }: { rows: PreScoutRow[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const colgroup = <colgroup>{columns.map(([key, , width]) => <col key={key} style={{ width }}/>)}</colgroup>;
  const header = <tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr>;

  return <div className="pre-scout-table-shell">
    <div className="pre-scout-table-sticky-header" aria-hidden="true">
      <table style={{ transform: `translateX(${-scrollLeft}px)` }}>{colgroup}<thead>{header}</thead></table>
      <span className="pre-scout-team-header">Team</span>
    </div>
    <div ref={scrollRef} className="table-scroll pre-scout-table-scroll" onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}>
      <table className="pre-scout-table" aria-label="Pre-scout reports">
        {colgroup}
        <thead className="sr-only">{header}</thead>
        <tbody>{rows.map((row) => <tr key={row.id}>
          <td className="pre-scout-team"><strong>{row.teamNumber}</strong><span>{row.teamName}</span></td>
          <td>{row.autos}</td><td>{row.activeShift}</td><td>{row.inactiveShift}</td><td>{row.traversal}</td><td>{row.averagePieces}</td><td>{row.withThem}</td><td>{row.againstThem}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}
