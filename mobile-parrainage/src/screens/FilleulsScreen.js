import React from 'react';
import {
  ScreenScroll, ScreenTitle, Card, Row, Empty,
} from '../components/ui';

export default function FilleulsScreen({ data }) {
  const { filleuls, refreshing, refresh } = data;

  return (
    <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
      <ScreenTitle
        icon="git-network"
        title="Mes filleuls"
        subtitle="Les partenaires que vous avez parrainés"
      />
      <Card>
        {filleuls.length === 0 && <Empty text="Aucun filleul pour l'instant." />}
        {filleuls.map((f, i) => {
          const name = `${f.prenom || ''} ${f.nom || ''}`.trim() || f.id;
          return (
            <Row
              key={f.id}
              last={i === filleuls.length - 1}
              avatar={name[0]?.toUpperCase()}
              main={name}
              sub={f.telephone || ''}
            />
          );
        })}
      </Card>
    </ScreenScroll>
  );
}
