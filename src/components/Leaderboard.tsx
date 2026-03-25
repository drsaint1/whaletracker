"use client";

interface LeaderboardEntry {
  address: string;
  volume: string;
  count: number;
}

function shortenAddress(addr: string) {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function Leaderboard({
  entries,
  watchlist,
}: {
  entries: LeaderboardEntry[];
  watchlist: Set<string>;
}) {
  const explorerBase = "https://shannon-explorer.somnia.network";

  return (
    <div className="leaderboard">
      <h3 className="chart-title">Top Whales</h3>
      {entries.length === 0 ? (
        <div className="chart-empty">No whale activity yet...</div>
      ) : (
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Address</th>
              <th>Volume</th>
              <th>Txns</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => {
              const isWatched = watchlist.has(entry.address.toLowerCase());
              return (
                <tr key={entry.address} className={isWatched ? "watched-row" : ""}>
                  <td className="rank">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
                  </td>
                  <td>
                    <a
                      href={`${explorerBase}/address/${entry.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="leaderboard-address"
                    >
                      {shortenAddress(entry.address)}
                    </a>
                    {isWatched && <span className="watch-badge">watching</span>}
                  </td>
                  <td className="volume">{Number(entry.volume).toLocaleString()}</td>
                  <td className="count">{entry.count}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
