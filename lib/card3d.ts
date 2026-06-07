// 투명 스트라바 PNG를 3D 평면에 입혀 Y축으로 연속 회전시키는 렌더러(Three.js).
// 미리보기·GIF 가 이 Card3D 하나를 공유한다(해상도만 다름).
//
// 양면 카드: 같은 텍스처를 앞/뒤 두 면에 붙여(뒤는 180° 돌려) 글자가 양쪽 다
// 바로 읽히게 한다. 평면이라 90°·270° 부근에서 얇아지는 건 실제 3D 회전의 자연스러운 모습.

import * as THREE from "three";

export class Card3D {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly pivot: THREE.Group;
  private readonly texture: THREE.Texture;

  constructor(
    overlay: HTMLImageElement,
    width: number,
    height: number,
    canvas?: HTMLCanvasElement
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true, // GIF 픽셀 읽기/캡처 타이밍 안전하게
    });
    this.renderer.setPixelRatio(1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);

    this.texture = new THREE.Texture(overlay);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;

    // 카드 크기: 세로 2 기준, 가로는 이미지 비율
    const aspect = overlay.naturalWidth / overlay.naturalHeight || 1;
    const ph = 2;
    const pw = ph * aspect;
    const geo = new THREE.PlaneGeometry(pw, ph);
    const mat = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      side: THREE.FrontSide,
      alphaTest: 0.02, // 거의 투명한 픽셀은 버려 테두리 깔끔하게
      toneMapped: false,
    });

    this.pivot = new THREE.Group();
    const front = new THREE.Mesh(geo, mat);
    front.position.z = 0.012; // 살짝 떨어뜨려 z-fighting 방지(얇은 두께감)
    const back = new THREE.Mesh(geo, mat);
    back.position.z = -0.012;
    back.rotation.y = Math.PI; // 뒷면도 글자가 바로 읽히게
    this.pivot.add(front, back);
    this.scene.add(this.pivot);

    // 카드가 화면 세로의 ~82%를 채우도록 카메라 거리 계산
    const fov = (this.camera.fov * Math.PI) / 180;
    this.camera.position.z = ph / 2 / Math.tan(fov / 2) / 0.82;
    this.camera.lookAt(0, 0, 0);

    this.setSize(width, height);
  }

  /** 출력 캔버스(WebGL) */
  get domElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  setSize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** 배경: null=투명, 숫자=불투명 색 */
  setBackground(color: number | null) {
    if (color === null) this.renderer.setClearColor(0x000000, 0);
    else this.renderer.setClearColor(color, 1);
  }

  /** angle(라디안)으로 한 프레임 렌더 */
  render(angle: number) {
    this.pivot.rotation.y = angle;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.texture.dispose();
    this.pivot.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.renderer.dispose();
  }
}
