"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Trash2 } from 'lucide-react';

const FlowRegionEditor = () => {
  const [mode, setMode] = useState('region');
  const [regions, setRegions] = useState([]);
  const [lines, setLines] = useState([]);
  const [doors, setDoors] = useState([]);
  const [activeDoorPoints, setActiveDoorPoints] = useState([]);
  const [activePoints, setActivePoints] = useState([]);
  const [activeRegionIndex, setActiveRegionIndex] = useState(null);
  const [activeLineIndex, setActiveLineIndex] = useState(null);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [tempLine, setTempLine] = useState(null);
  const canvasRef = useRef(null);

  const getPointToLineDistance = (x, y, x1, y1, x2, y2) => {
    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    const param = lenSq !== 0 ? dot / lenSq : -1;
    
    const xx = param < 0 ? x1 : param > 1 ? x2 : x1 + param * C;
    const yy = param < 0 ? y1 : param > 1 ? y2 : y1 + param * D;
    
    return {
      distance: Math.sqrt(Math.pow(x - xx, 2) + Math.pow(y - yy, 2)),
      point: { x: xx, y: yy },
      t: Math.max(0, Math.min(1, param))
    };
  };

  const findPathBetweenPoints = (start, end, region) => {
    const points = region.points;
    let startIndex = -1;
    let endIndex = -1;
    
    points.forEach((point, i) => {
      const next = points[(i + 1) % points.length];
      const startDist = getPointToLineDistance(start.x, start.y, point.x, point.y, next.x, next.y);
      const endDist = getPointToLineDistance(end.x, end.y, point.x, point.y, next.x, next.y);
      
      if (startDist.distance < 0.1) startIndex = i;
      if (endDist.distance < 0.1) endIndex = i;
    });

    if (startIndex === -1 || endIndex === -1) return [start, end];

    const path = [start];
    let currentIndex = startIndex;
    while (currentIndex !== endIndex) {
      currentIndex = (currentIndex + 1) % points.length;
      path.push(points[currentIndex]);
    }
    path.push(end);
    return path;
  };

  const findClosestValidPoint = (x, y) => {
    const THRESHOLD = 10;
    let bestResult = null;
    let minDistance = Infinity;

    regions.forEach((region, regionIndex) => {
      const points = region.points;
      points.forEach((point, i) => {
        const next = points[(i + 1) % points.length];
        const result = getPointToLineDistance(x, y, point.x, point.y, next.x, next.y);
        
        if (result.distance < minDistance && result.distance < THRESHOLD) {
          minDistance = result.distance;
          bestResult = {
            ...result,
            type: 'region',
            regionIndex,
            segmentIndex: i,
            region
          };
        }
      });
    });

    return bestResult;
  };

  const handleCanvasClick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    switch (mode) {
      case 'region': 
        setActivePoints([...activePoints, { x, y }]);
        break;
      case 'line':
        if (activePoints.length === 0) {
          setActivePoints([{ x, y }]);
        } else {
          setLines([...lines, {
            id: `line_${lines.length + 1}`,
            start: activePoints[0],
            end: { x, y }
          }]);
          setActivePoints([]);
        }
        break;
      case 'door':
        const result = findClosestValidPoint(x, y);
        if (!result) return;

        const newPoint = {
          x: result.point.x,
          y: result.point.y,
          type: result.type,
          regionIndex: result.regionIndex,
          segmentIndex: result.segmentIndex,
          region: result.region
        };

        if (activeDoorPoints.length === 0) {
          setActiveDoorPoints([newPoint]);
        } else {
          const start = activeDoorPoints[0];
          const pathPoints = findPathBetweenPoints(start, newPoint, start.region);
          if (start.region === newPoint.region) {
            setDoors([...doors, {
              id: `door_${doors.length + 1}`,
              start,
              end: newPoint,
              pathPoints
            }]);
          }
          setActiveDoorPoints([]);
        }
        break;
    }
  };

  const handleMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (mode === 'door') {
      const result = findClosestValidPoint(x, y);
      setHoveredPoint(result ? result.point : null);
    } else if (mode === 'line' && activePoints.length === 1) {
      setTempLine({
        start: activePoints[0],
        end: { x, y }
      });
    }
  };

  const handleFinishDrawing = () => {
    if (mode === 'region' && activePoints.length >= 3) {
      setRegions([...regions, {
        id: `region_${regions.length + 1}`,
        points: activePoints
      }]);
      setActivePoints([]);
    }
  };

  const handleDelete = (type, index) => {
    switch (type) {
      case 'region':
        setRegions(regions.filter((_, i) => i !== index));
        break;
      case 'line':
        setLines(lines.filter((_, i) => i !== index));
        break;
      case 'door':
        setDoors(doors.filter((_, i) => i !== index));
        break;
    }
  };

  const saveToConfig = async () => {
    const configData = {
      regions: regions.reduce((acc, region) => ({
        ...acc,
        [region.id]: {
          points: region.points.map(point => [point.x, point.y])
        }
      }), {}),
      lines: lines.reduce((acc, line) => ({
        ...acc,
        [line.id]: {
          start: [line.start.x, line.start.y],
          end: [line.end.x, line.end.y]
        }
      }), {}),
      doors: doors.reduce((acc, door) => ({
        ...acc,
        [door.id]: {
          pathPoints: door.pathPoints.map(point => [point.x, point.y])
        }
      }), {})
    };

    try {
      const response = await fetch('/api/save-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(configData)
      });

      if (!response.ok) {
        throw new Error('Failed to save configuration');
      }

      alert('配置已成功保存！');
    } catch (error) {
      console.error('保存配置時出錯：', error);
      alert('保存配置失敗');
    }
  };

  const loadConfig = useCallback(async () => {
    try {
      const response = await fetch('/api/load-config');
      const data = await response.json();
      
      if (!data.exists) return;
      
      // 轉換配置數據為組件狀態
      const loadedRegions = Object.entries(data.config.regions).map(([id, region]) => ({
        id,
        points: region.points.map(point => ({
          x: parseFloat(point[0]),
          y: parseFloat(point[1])
        }))
      }));
      
      const loadedLines = Object.entries(data.config.lines).map(([id, line]) => ({
        id,
        start: {
          x: parseFloat(line.start[0]),
          y: parseFloat(line.start[1])
        },
        end: {
          x: parseFloat(line.end[0]),
          y: parseFloat(line.end[1])
        }
      }));
      
      const loadedDoors = Object.entries(data.config.doors).map(([id, door]) => ({
        id,
        pathPoints: door.pathPoints.map(point => ({
          x: parseFloat(point[0]),
          y: parseFloat(point[1])
        }))
      }));
      
      setRegions(loadedRegions);
      setLines(loadedLines);
      setDoors(loadedDoors);
    } catch (error) {
      console.error('載入配置時出錯：', error);
      alert('載入配置失敗');
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    regions.forEach((region, index) => {
      ctx.beginPath();
      ctx.moveTo(region.points[0].x, region.points[0].y);
      region.points.forEach((point, i) => {
        if (i > 0) ctx.lineTo(point.x, point.y);
      });
      ctx.closePath();
      ctx.strokeStyle = index === activeRegionIndex ? '#0066cc' : '#666';
      ctx.stroke();
    });

    lines.forEach((line, index) => {
      ctx.beginPath();
      ctx.moveTo(line.start.x, line.start.y);
      ctx.lineTo(line.end.x, line.end.y);
      ctx.strokeStyle = index === activeLineIndex ? '#0066cc' : '#666';
      ctx.stroke();
    });

    if (activePoints.length > 0) {
      ctx.beginPath();
      ctx.moveTo(activePoints[0].x, activePoints[0].y);
      activePoints.forEach((point, i) => {
        if (i > 0) ctx.lineTo(point.x, point.y);
      });
      if (mode === 'region' && activePoints.length > 2) ctx.closePath();
      ctx.strokeStyle = '#0066cc';
      ctx.stroke();
    }

    if (tempLine) {
      ctx.beginPath();
      ctx.moveTo(tempLine.start.x, tempLine.start.y);
      ctx.lineTo(tempLine.end.x, tempLine.end.y);
      ctx.strokeStyle = '#0066cc';
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    doors.forEach((door, index) => {
      if (door.pathPoints && door.pathPoints.length > 0) {
        ctx.beginPath();
        ctx.moveTo(door.pathPoints[0].x, door.pathPoints[0].y);
        door.pathPoints.forEach((point, i) => {
          if (i > 0) ctx.lineTo(point.x, point.y);
        });
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.lineWidth = 1;

        const midPoint = door.pathPoints[Math.floor(door.pathPoints.length / 2)];
        ctx.fillStyle = '#000';
        ctx.font = '12px Arial';
        ctx.fillText(`D${index + 1}`, midPoint.x + 8, midPoint.y - 8);
      }
    });

    if (hoveredPoint && mode === 'door') {
      ctx.beginPath();
      ctx.arc(hoveredPoint.x, hoveredPoint.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
      ctx.fill();
    }

    if (activeDoorPoints.length === 1) {
      const point = activeDoorPoints[0];
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ff0000';
      ctx.fill();
    }
  }, [regions, lines, doors, activePoints, hoveredPoint, tempLine, mode, activeDoorPoints, activeRegionIndex, activeLineIndex]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex gap-4 mb-4">
        <button
          className={`px-4 py-2 rounded ${mode === 'region' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          onClick={() => {
            setMode('region');
            setActivePoints([]);
            setActiveDoorPoints([]);
          }}
        >
          Add Flow Region
        </button>
        <button
          className={`px-4 py-2 rounded ${mode === 'line' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          onClick={() => {
            setMode('line');
            setActivePoints([]);
            setActiveDoorPoints([]);
          }}
        >
          Add Line
        </button>
        <button
          className={`px-4 py-2 rounded ${mode === 'door' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          onClick={() => {
            setMode('door');
            setActivePoints([]);
            setActiveDoorPoints([]);
          }}
        >
          Add Door
        </button>
        <button
          className="px-4 py-2 bg-green-500 text-white rounded"
          onClick={handleFinishDrawing}
          disabled={mode !== 'region' || activePoints.length < 3}
        >
          Finish Drawing
        </button>
        <button
          className="px-4 py-2 bg-purple-500 text-white rounded"
          onClick={saveToConfig}
        >
          Save Configuration
        </button>
      </div>

      <canvas
        ref={canvasRef}
        width={800}
        height={400}
        className="border border-gray-300 bg-white"
        onClick={handleCanvasClick}
        onMouseMove={handleMouseMove}
      />

      <div className="grid grid-cols-3 gap-4">
        <div>
          <h3 className="font-bold mb-2">Flow Regions:</h3>
          {regions.map((region, index) => (
            <div key={region.id} className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={activeRegionIndex === index}
                onChange={() => setActiveRegionIndex(activeRegionIndex === index ? null : index)}
              />
              <span>{region.id}</span>
              <button onClick={() => handleDelete('region', index)} className="p-1">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div>
          <h3 className="font-bold mb-2">Lines:</h3>
          {lines.map((line, index) => (
            <div key={line.id} className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={activeLineIndex === index}
                onChange={() => setActiveLineIndex(activeLineIndex === index ? null : index)}
              />
              <span>{line.id}</span>
              <button onClick={() => handleDelete('line', index)} className="p-1">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div>
          <h3 className="font-bold mb-2">Doors:</h3>
          {doors.map((door, index) => (
            <div key={door.id} className="flex items-center gap-2 mb-2">
              <input type="checkbox" />
              <span>{`Door_${index + 1}`}</span>
              <button onClick={() => handleDelete('door', index)} className="p-1">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FlowRegionEditor;