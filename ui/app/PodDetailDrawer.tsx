import React, { useEffect, type ReactNode } from 'react';
import { Button } from '@dynatrace/strato-components/buttons';
import { XmarkIcon } from '@dynatrace/strato-icons';
import { type Pod } from './model';
import { useOverlayFocus, useRetainedOverlay } from './overlays';

export function PodDetailDrawer({ pod, onClose, renderDetails }: {
  pod: Pod | null; onClose: () => void; renderDetails: (pod: Pod) => ReactNode;
}) {
  const { current, open } = useRetainedOverlay(pod);
  const surface = useOverlayFocus(Boolean(pod), true, onClose);
  useEffect(() => { if (surface.current) surface.current.scrollTop = 0; }, [pod?.id, surface]);
  if (!current) return null;
  return <div className={`pod-drawer-backdrop ${open ? 'is-open' : ''}`} aria-hidden={!pod} {...(!pod ? { inert: '' } : {})}>
    <button className="overlay-dismiss" aria-label="Pod 상세 패널 바깥 영역" tabIndex={-1} onClick={onClose}/>
    <div ref={surface} className="details pod-detail-drawer" role="dialog" aria-modal="true" aria-label={`${current.name} Pod 상세`} tabIndex={-1}>
      <div className="drawer-toolbar"><span className="eyebrow">Pod 상세</span><Button className="popup-close" size="condensed" aria-label="Pod 상세 패널 닫기" onClick={onClose}><Button.Prefix><XmarkIcon/></Button.Prefix></Button></div>
      {renderDetails(current)}
    </div>
  </div>;
}
