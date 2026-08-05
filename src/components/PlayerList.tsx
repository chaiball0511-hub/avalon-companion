import type { ReactNode } from 'react';
import type { PublicPlayerView } from '@shared/types';
import { useT } from '../i18n';
import { Tag } from './ui';

export function PlayerRow({
  player,
  meId,
  selected,
  onClick,
  right,
  showConfirm,
}: {
  player: PublicPlayerView;
  meId?: string | null;
  selected?: boolean;
  onClick?: () => void;
  right?: ReactNode;
  showConfirm?: boolean;
}) {
  const t = useT();
  const classes = ['player-row'];
  if (onClick) classes.push('selectable');
  if (selected) classes.push('selected');

  return (
    <div
      className={classes.join(' ')}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(event) => {
        if (onClick && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <span className="seat">{player.seatIndex + 1}</span>
      <span className={`dot${player.online ? ' online' : ''}`} title={player.online ? t('common.online') : t('common.offline')} />
      <span className="name">
        {player.nickname}
        {meId === player.id && <span className="faint">（{t('common.you')}）</span>}
      </span>
      {player.isHost && <Tag tone="gold">{t('common.host')}</Tag>}
      {player.isFirstLeader && <Tag tone="gold">队长</Tag>}
      {player.holdsLady && <Tag tone="good">湖</Tag>}
      {player.hasLeft && <Tag tone="evil">{t('common.left')}</Tag>}
      {showConfirm &&
        (player.roleConfirmed ? (
          <Tag tone="good">{t('reveal.confirmed')}</Tag>
        ) : (
          <Tag tone="off">{t('players.notConfirmed')}</Tag>
        ))}
      {right}
    </div>
  );
}

export function PlayerList({
  players,
  meId,
  showConfirm,
  onSelect,
  selectedId,
  renderRight,
}: {
  players: PublicPlayerView[];
  meId?: string | null;
  showConfirm?: boolean;
  onSelect?: (playerId: string) => void;
  selectedId?: string | null;
  renderRight?: (player: PublicPlayerView) => ReactNode;
}) {
  return (
    <div className="list">
      {players.map((player) => (
        <PlayerRow
          key={player.id}
          player={player}
          meId={meId}
          showConfirm={showConfirm}
          selected={selectedId === player.id}
          onClick={onSelect ? () => onSelect(player.id) : undefined}
          right={renderRight?.(player)}
        />
      ))}
    </div>
  );
}
