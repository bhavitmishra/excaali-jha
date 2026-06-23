import {
  CaptureUpdateAction,
  Excalidraw,
  // exportToSvg,
  sceneCoordsToViewportCoords,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { useEffect, useRef, useState, type JSX } from "react";
import ShinyButton from "./comp/Button";
import newElements from "./scene/newElement";
import axios from "axios";
import GridToggle from "./comp/GridToggle"


const extractPromptTexts = (elements: any[]): string[] => {
  return elements
    .filter((el) => el.type === "text")
    .map((el) => el.text.trim())
    .filter((text) => text.startsWith("{") && text.endsWith("}"))
    .map((text) => text.slice(1, -1)); // remove the { and }
};

export default function App() {
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const [hasPrompt, setHasPrompt] = useState(false);
  const [promptPos, setPromptPos] = useState<{ x: number; y: number } | null>(null);
  const [grid , setGrid] = useState(false);

  const toggle = ()=>{
    setGrid(grid => !grid)
  }

  // ---------------------------
  // Your existing logic (unchanged)
  // ---------------------------
  const handleChange = () => {
    const elements = excalidrawAPI.getSceneElements();
    const promptEl = elements.find(
      (el) =>
        el.type === "text" &&
        el.text?.trim().startsWith("{") &&
        el.text?.trim().endsWith("}")
    );
    // setHasPrompt(foundPrompt);
    if (promptEl) {
      const newPos = {
        x: promptEl.x + promptEl.width + 10,
        y: promptEl.y,
      };

      // Only update if position actually changed
      if (!promptPos || newPos.x !== promptPos.x || newPos.y !== promptPos.y) {
        setPromptPos(newPos);
        // insertOrUpdateCanvasButton(promptEl);
      }
      if (!hasPrompt) setHasPrompt(true);
    } else {
      // Only update if it was true before
      if (hasPrompt) setHasPrompt(false);
      if (promptPos) setPromptPos(null);
    }
    console.log(`x = ${promptPos?.x} y = ${promptPos?.y} and ${hasPrompt}`);

    // save locally
    const existingElements = excalidrawAPI.getSceneElements();
    const appState = excalidrawAPI.getAppState();
    localStorage.setItem("excalidraw-scene", JSON.stringify({existingElements,appState}));
  };

  const handlePromptScan = () => {
    const elements = excalidrawAPI.getSceneElements();
    const prompts = extractPromptTexts(elements);
    if (prompts.length > 0) {
      console.log(`prompts = ${prompts}`);
    } else {
      console.log("No prompts detected.");
    }
  };

  const updateScene = () => {
    const existingElements = excalidrawAPI.getSceneElements();
    const sceneData = {
      elements: [...existingElements, ...newElements],
      // appState: {
      //   viewBackgroundColor: "#edf2ff",
      // },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
    if (excalidrawAPI) {
      excalidrawAPI.updateScene(sceneData);
    }

    const elements = excalidrawAPI.getSceneElements();
    console.log(elements.map((el) => ({ id: el.id, locked: el.locked })));
  };

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (e.key === "Enter" && hasPrompt && isCmdOrCtrl) {
        e.preventDefault();
        // handlePromptScan();
        const elements = excalidrawAPI.getSceneElements();
        const prompts = extractPromptTexts(elements);
        window.alert(`prompt = ${prompts}`);
        const res = await axios.post("http://localhost:3000/api/prompt", { prompts });
        console.log(res);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [hasPrompt]);

  // ---------------------------
  // Overlay-specific additions (non-invasive)
  // - Adds a containerRef so we can size the overlay
  // - Polls excalidrawAPI.getAppState() via requestAnimationFrame to keep overlay live 24/7
  // - Renders an SVG grid on top with pointer-events:none and high z-index
  // ---------------------------
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [overlayAppState, setOverlayAppState] = useState<any | null>(null);

  // initialize viewport size and resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setViewport({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    // initial size
    setViewport({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // continuous update loop (poll appState from excalidrawAPI so overlay works even if your onChange doesn't pass appState)
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      try {
        const apiState = excalidrawAPI?.getAppState?.();
        if (apiState) {
          // only update when changed to avoid re-renders
          setOverlayAppState((prev: any) => {
            if (!prev) return apiState;
            if (
              prev.zoom !== apiState.zoom ||
              prev.scrollX !== apiState.scrollX ||
              prev.scrollY !== apiState.scrollY ||
              prev.offsetLeft !== apiState.offsetLeft ||
              prev.offsetTop !== apiState.offsetTop
            ) {
              return apiState;
            }
            return prev;
          });
        }
      } catch (e) {
        // silently ignore if api isn't ready
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [excalidrawAPI]);

  // small helper to convert scene -> viewport using overlayAppState or fallback to api state directly
  function sceneToVp(x: number, y: number) {
    const st = overlayAppState ?? excalidrawAPI?.getAppState?.();
    if (!st) return { x: 0, y: 0 };
    try {
      return sceneCoordsToViewportCoords({ sceneX: x, sceneY: y }, st);
    } catch (e) {
      return { x: 0, y: 0 };
    }
  }

  // Render grid SVG (kept simple and bounded to viewport)
  function renderGridSVG() {
    const st = overlayAppState ?? excalidrawAPI?.getAppState?.();
    if (!st || viewport.w === 0 || viewport.h === 0) return null;

    // compute scene corners
    let topLeftScene;
    let bottomRightScene;
    try {
      topLeftScene = viewportCoordsToSceneCoords({ clientX: 0, clientY: 0 }, st);
      bottomRightScene = viewportCoordsToSceneCoords({ clientX: viewport.w, clientY: viewport.h }, st);
    } catch (e) {
      return null;
    }

    const gridSize = 100; // scene units
    const minorDivisions = 4;
    const showMinor = true;
    const pad = Math.max(gridSize * 2, 500);

    const minX = Math.floor((Math.min(topLeftScene.x, bottomRightScene.x) - pad) / gridSize) * gridSize;
    const maxX = Math.ceil((Math.max(topLeftScene.x, bottomRightScene.x) + pad) / gridSize) * gridSize;
    const minY = Math.floor((Math.min(topLeftScene.y, bottomRightScene.y) - pad) / gridSize) * gridSize;
    const maxY = Math.ceil((Math.max(topLeftScene.y, bottomRightScene.y) + pad) / gridSize) * gridSize;

    const lines: JSX.Element[] = [];

    for (let gx = minX; gx <= maxX; gx += gridSize) {
      const p1 = sceneToVp(gx, minY);
      const p2 = sceneToVp(gx, maxY);
      lines.push(
        <line key={`v-${gx}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="rgba(120,120,120,0.28)" strokeWidth={1} />
      );

      if (showMinor && minorDivisions > 1) {
        for (let i = 1; i < minorDivisions; ++i) {
          const sx = gx + (i * gridSize) / minorDivisions;
          const mp1 = sceneToVp(sx, minY);
          const mp2 = sceneToVp(sx, maxY);
          lines.push(
            <line
              key={`v-m-${gx}-${i}`}
              x1={mp1.x}
              y1={mp1.y}
              x2={mp2.x}
              y2={mp2.y}
              stroke="rgba(120,120,120,0.12)"
              strokeWidth={0.5}
            />
          );
        }
      }
    }

    for (let gy = minY; gy <= maxY; gy += gridSize) {
      const p1 = sceneToVp(minX, gy);
      const p2 = sceneToVp(maxX, gy);
      lines.push(
        <line key={`h-${gy}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="rgba(120,120,120,0.28)" strokeWidth={1} />
      );

      if (showMinor && minorDivisions > 1) {
        for (let i = 1; i < minorDivisions; ++i) {
          const sy = gy + (i * gridSize) / minorDivisions;
          const mp1 = sceneToVp(minX, sy);
          const mp2 = sceneToVp(maxX, sy);
          lines.push(
            <line
              key={`h-m-${gy}-${i}`}
              x1={mp1.x}
              y1={mp1.y}
              x2={mp2.x}
              y2={mp2.y}
              stroke="rgba(120,120,120,0.12)"
              strokeWidth={0.5}
            />
          );
        }
      }
    }

    // origin
    const origin = sceneToVp(0, 0);
    const originCrosshair = (
      <>
        <line x1={origin.x - 8} y1={origin.y} x2={origin.x + 8} y2={origin.y} stroke="red" strokeWidth={1.5} />
        <line x1={origin.x} y1={origin.y - 8} x2={origin.x} y2={origin.y + 8} stroke="red" strokeWidth={1.5} />
        <circle cx={origin.x} cy={origin.y} r={2.2} fill="red" />
        <text x={origin.x + 10} y={origin.y - 10} fontSize={12} fill="red">
          (0,0)
        </text>
      </>
    );

    return (
      <svg
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          pointerEvents: "none",
          zIndex: 9999,
        }}
        width={viewport.w}
        height={viewport.h}
      >
        { grid ? lines : null}
        {originCrosshair}
      </svg>
    );
  }

  // ---------------------------
  // Render: I only added containerRef and the overlay SVG here.
  // Your Excalidraw props and onChange logic are untouched.
  // ---------------------------
  return (
    <div ref={containerRef} className="h-screen w-screen" style={{ position: "relative" }}>

      <Excalidraw
        excalidrawAPI={(api) => setExcalidrawAPI(api)}
        renderTopRightUI={() => {
          
          return <div className="flex items-center space-x-4">
  <GridToggle grid={grid} toggle={toggle} />
  <ShinyButton onClick={updateScene} />
</div>
        }}
        initialData={(() => {
  try {
    const saved = localStorage.getItem("excalidraw-scene");
    if (saved) {
      const { existingElements } = JSON.parse(saved);
      return { 
        elements: existingElements, 
        appState: { viewBackgroundColor: "#ffffff" }  // always fresh appState
      };
    }
  } catch (e) {
    localStorage.removeItem("excalidraw-scene"); // wipe corrupted data
  }
  return { elements: [], appState: { viewBackgroundColor: "#ffffff" } };
})()}
        theme="dark"
        onChange={() => {
          // your original handlers - unchanged
          handlePromptScan();
          handleChange();
        }}
      />
      {renderGridSVG()}
    </div>
  );
}
