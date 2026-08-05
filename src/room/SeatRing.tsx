import type { PublicPlayerView } from '@shared/types';

/** 环形座位示意图：湖上夫人按顺时针「右侧」传递 */
export function SeatRing({ players, meId }: { players: PublicPlayerView[]; meId?: string | null }) {
  const seats = players.filter((p) => !p.hasLeft);
  const count = seats.length;
  if (count === 0) return null;

  return (
    <div className="seat-ring" aria-hidden={false} role="img" aria-label="座位顺序">
      {seats.map((player, index) => {
        const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
        const radius = 38;
        const left = 50 + radius * Math.cos(angle);
        const top = 50 + radius * Math.sin(angle);
        const classes = ['seat-chip'];
        if (player.isFirstLeader) classes.push('leader');
        else if (player.holdsLady) classes.push('lady');
        return (
          <div
            key={player.id}
            className={classes.join(' ')}
            style={{ left: `${left}%`, top: `${top}%` }}
          >
            <span className="bubble">{player.seatIndex + 1}</span>
            <span className="label">
              {player.nickname}
              {player.id === meId ? ' ·' : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}
