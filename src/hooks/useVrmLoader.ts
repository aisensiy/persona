import { useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

export function useVrmLoader(url: string): VRM | null {
  const gltf = useLoader(GLTFLoader, url, (loader) => {
    loader.register((parser) => new VRMLoaderPlugin(parser));
  });

  return useMemo(() => {
    const vrm = gltf.userData.vrm as VRM | undefined;
    if (!vrm) return null;
    VRMUtils.removeUnnecessaryVertices(vrm.scene);
    // combineSkeletons corrupts MMD-converted rigs (non-normalized rest
    // transforms, e.g. Remiel's wing chains) and our models ship a single
    // skin anyway, so there is nothing to combine.
    VRMUtils.combineMorphs(vrm);
    VRMUtils.rotateVRM0(vrm);
    return vrm;
  }, [gltf]);
}
