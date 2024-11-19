import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import yaml from 'js-yaml';
import path from 'path';

type ConfigValue = number | string | [number, number];

interface YAMLData {
  regions: Record<string, {
    points: [number, number][];
  }>;
  lines: Record<string, {
    start: [number, number];
    end: [number, number];
  }>;
  doors: Record<string, {
    pathPoints: [number, number][];
  }>;
}

export async function POST(request: Request) {
  try {
    const data = await request.json() as YAMLData;
    const configPath = path.join(process.cwd(), 'config.yaml');
    
    const yamlStr = yaml.dump(data, {
      indent: 2,
      lineWidth: -1,
      styles: {
        '!!seq': 'block'
      },
      replacer: (key: string, value: ConfigValue) => {
        if (Array.isArray(value) && value.length === 2 && 
            typeof value[0] === 'number' && 
            typeof value[1] === 'number') {
          return `(${value[0]}, ${value[1]})`;
        }
        return value;
      }
    });
    
    await fs.writeFile(configPath, yamlStr, 'utf8');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving config:', error);
    return NextResponse.json(
      { error: '保存配置失敗' },
      { status: 500 }
    );
  }
}

export async function GET() {
    try {
      const configPath = path.join(process.cwd(), 'config.yaml');
      
      // 檢查文件是否存在
      try {
        await fs.access(configPath);
      } catch {
        return NextResponse.json({ exists: false });
      }
      
      const fileContent = await fs.readFile(configPath, 'utf8');
      const config = yaml.load(fileContent);
      
      return NextResponse.json({ exists: true, config });
    } catch (error) {
      console.error('Error loading config:', error);
      return NextResponse.json(
        { error: '讀取配置失敗' },
        { status: 500 }
      );
    }
  }