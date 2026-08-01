'use client';

import React, { useState, useEffect } from 'react';
import { UIStateAgent, UserRatioState, UserType, ProviderMixState } from './UIStateAgent';
import { PricingDataAgent, ModelPricing, FALLBACK_PRICING } from './PricingDataAgent';
import { SimulationEngineAgent, DEFAULT_TOKEN_USAGE, UserTokenUsage } from './SimulationEngineAgent';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { Users, DollarSign, RefreshCw, Layers, Award, Sparkles, TrendingUp, TrendingDown, Info, GitCompare } from 'lucide-react';
import dynamicData from './dynamicData.json';

type PerformanceSpec = { context: string; maxOutput: string; valsIndex: string; sweBench: string; features: string };

const MODEL_PERFORMANCE_DB: Record<string, PerformanceSpec> =
  (dynamicData.performanceData as Record<string, PerformanceSpec>) || {};

const getValsIndexVal = (modelName: string, db: Record<string, { valsIndex: string }>) => {
  const spec = db[modelName];
  if (!spec) return 0;
  const score = parseFloat(spec.valsIndex.replace('%', ''));
  return Number.isFinite(score) ? score : 0;
};

type ProviderName = 'OpenAI' | 'Anthropic' | 'Google';
type ModelTier = 'high' | 'mid';
type NewsEvent = { date: string; headline: string; content: string };
type NewsEventsByProvider = Record<ProviderName, NewsEvent[]>;
type SelectedModelBySlot = Partial<Record<`${ProviderName}:${ModelTier}`, string>>;

interface SimulationPreset {
  name: string;
  totalUsers: number;
  exchangeRate: number;
  currencyMode: 'USD' | 'KRW';
  ratios: UserRatioState;
  mixRatios: ProviderMixState;
  selectedModelBySlot: SelectedModelBySlot;
  isCustom?: boolean;
}

type Metadata = { dataUpdatedAt?: string };
type ChartValue = unknown;
type TrendPoint = { date?: string; week: string; OpenAI: number | null; Anthropic: number | null; Google: number | null };
type CostChartDatum = {
  name: string;
  cost: number;
  usdCost: number;
  krwCost: number;
  provider: string;
  tierLabel: string;
};

const PROVIDER_NEWS_EVENTS: NewsEventsByProvider = (dynamicData.newsData as NewsEventsByProvider) || {
  OpenAI: [],
  Anthropic: [],
  Google: []
};

const TREND_DATA = (dynamicData.trendData as { high?: TrendPoint[]; mid?: TrendPoint[] }) || {};
const DATA_METADATA = (dynamicData.metadata as Metadata) || {};
const APP_UPDATED_AT = '2026.07.31';
const MODEL_LAUNCH_DATES: Record<string, string> = {
  'gpt-5.6-sol': '2026-06-26',
  'gpt-5.6-terra': '2026-06-26',
  'gpt-5.6-luna': '2026-06-26',
  'gpt-5.4-nano': '2026-01-01',
  'claude-fable-5': '2026-06-09',
  'claude-opus-5': '2026-07-24',
  'claude-sonnet-5': '2026-06-30',
  'claude-haiku-4-5': '2025-10-01',
  'gemini-3.6-flash': '2026-07-24',
  'gemini-3.5-flash': '2026-05-19',
  'gemini-3.1-pro': '2026-02-19',
  'gemini-3.5-flash-lite': '2026-05-19',
  'gemini-3.1-flash-lite': '2026-05-07',
};

const isProviderName = (provider: string): provider is ProviderName => {
  return provider === 'OpenAI' || provider === 'Anthropic' || provider === 'Google';
};

function CostTooltip({
  active,
  payload,
  chartMode,
  formatNumber
}: {
  active?: boolean;
  payload?: Array<{ payload: CostChartDatum }>;
  chartMode: 'individual' | 'blended';
  formatNumber: (num: number, maxDecimals?: number) => string;
}) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-2xl backdrop-blur-xl">
        <p className="font-bold text-white text-base mb-1">{data.name}</p>
        <p className="text-slate-400 text-xs mb-2">
          {chartMode === 'individual' ? `제공사: ${data.provider} | ${data.tierLabel} 모델` : data.tierLabel}
        </p>
        <div className="border-t border-slate-800 pt-2 flex flex-col gap-1 text-sm">
          <div className="flex justify-between gap-6">
            <span className="text-slate-400">USD 비용:</span>
            <span className="font-bold text-white">${formatNumber(data.usdCost, 2)}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-indigo-400 font-medium">KRW 비용:</span>
            <span className="font-bold text-indigo-300">₩{formatNumber(data.krwCost, 0)}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

export default function CalculatorDashboard() {
  const [totalUsers, setTotalUsers] = useState<number>(1000);
  const [exchangeRate, setExchangeRate] = useState<number>(1500);
  const [currencyMode, setCurrencyMode] = useState<'USD' | 'KRW'>('USD');
  const [chartMode, setChartMode] = useState<'individual' | 'blended'>('blended');

  // User cohort ratio state.
  const [ratios, setRatios] = useState<UserRatioState>({
    light: 60,
    heavy: 20,
    stdDev: 15,
    heavyDev: 5,
  });

  const [developerRatio, setDeveloperRatio] = useState<number>(20);

  // Model mix ratios state for 3 providers (High-tier vs Mid-tier blend)
  const [mixRatios, setMixRatios] = useState<ProviderMixState>({
    OpenAI: { high: 20, mid: 80 },
    Anthropic: { high: 20, mid: 80 },
    Google: { high: 20, mid: 80 }
  });

  // Flag to sync all model mix ratios together or adjust separately
  const [syncModelMixRatios, setSyncModelMixRatios] = useState<boolean>(true);

  // pricing state for Pricing-Data-Agent
  const [pricingData, setPricingData] = useState<ModelPricing[]>(FALLBACK_PRICING);
  const [selectedModelBySlot, setSelectedModelBySlot] = useState<SelectedModelBySlot>({});
  const [dataUpdatedAt, setDataUpdatedAt] = useState(DATA_METADATA.dataUpdatedAt || '확인 필요');

  // Dynamic performance and news events database states mapped from data.md
  const [performanceDb, setPerformanceDb] = useState<Record<string, PerformanceSpec>>(MODEL_PERFORMANCE_DB);
  const [newsEvents, setNewsEvents] = useState(PROVIDER_NEWS_EVENTS);
  const [trendData, setTrendData] = useState<{ high: TrendPoint[]; mid: TrendPoint[] }>({
    high: TREND_DATA.high || [],
    mid: TREND_DATA.mid || [],
  });

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // -------------------------------------------------------------
  // 💾 나만의 시뮬레이션 프리셋 저장 & 리포트 다운로드 (Preset & Export)
  // -------------------------------------------------------------
  const SYSTEM_PRESETS: SimulationPreset[] = [
    {
      name: '기본 시나리오 (Default)',
      totalUsers: 1000,
      exchangeRate: 1500,
      currencyMode: 'USD',
      ratios: { light: 60, heavy: 20, stdDev: 15, heavyDev: 5 },
      mixRatios: {
        OpenAI: { high: 20, mid: 80 },
        Anthropic: { high: 20, mid: 80 },
        Google: { high: 20, mid: 80 }
      },
      selectedModelBySlot: {
        'OpenAI:high': 'gpt-5.6-sol',
        'OpenAI:mid': 'gpt-5.6-luna',
        'Anthropic:high': 'claude-opus-5',
        'Anthropic:mid': 'claude-haiku-4-5',
        'Google:high': 'gemini-3.6-flash',
        'Google:mid': 'gemini-3.5-flash-lite'
      }
    },
    {
      name: '에이전트/개발자 중심 (Agent-centric)',
      totalUsers: 1000,
      exchangeRate: 1500,
      currencyMode: 'USD',
      ratios: { light: 10, heavy: 20, stdDev: 40, heavyDev: 30 },
      mixRatios: {
        OpenAI: { high: 60, mid: 40 },
        Anthropic: { high: 60, mid: 40 },
        Google: { high: 60, mid: 40 }
      },
      selectedModelBySlot: {
        'OpenAI:high': 'gpt-5.6-sol',
        'OpenAI:mid': 'gpt-5.6-luna',
        'Anthropic:high': 'claude-opus-5',
        'Anthropic:mid': 'claude-haiku-4-5',
        'Google:high': 'gemini-3.6-flash',
        'Google:mid': 'gemini-3.5-flash-lite'
      }
    },
    {
      name: '최소 비용 절약 (Cost-saving)',
      totalUsers: 1000,
      exchangeRate: 1500,
      currencyMode: 'KRW',
      ratios: { light: 60, heavy: 25, stdDev: 10, heavyDev: 5 },
      mixRatios: {
        OpenAI: { high: 0, mid: 100 },
        Anthropic: { high: 0, mid: 100 },
        Google: { high: 0, mid: 100 }
      },
      selectedModelBySlot: {
        'OpenAI:high': 'gpt-5.6-terra',
        'OpenAI:mid': 'gpt-5.6-luna',
        'Anthropic:high': 'claude-sonnet-5',
        'Anthropic:mid': 'claude-haiku-4-5',
        'Google:high': 'gemini-3.5-flash',
        'Google:mid': 'gemini-3.5-flash-lite'
      }
    }
  ];

  const [customPresets, setCustomPresets] = useState<SimulationPreset[]>([]);

  // Load custom presets from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ai_pricing_custom_presets');
      if (saved) {
        try {
          setCustomPresets(JSON.parse(saved));
        } catch (e) {
          console.error('Failed to parse saved presets', e);
        }
      }
    }
  }, []);

  const applyPreset = (preset: SimulationPreset) => {
    setRatios(preset.ratios);
    setMixRatios(preset.mixRatios);
    if (preset.selectedModelBySlot) {
      setSelectedModelBySlot(preset.selectedModelBySlot);
    }
  };

  const handleSavePreset = () => {
    const presetName = prompt('저장할 시뮬레이션 시나리오 프리셋의 이름을 입력하세요:', `사용자 시나리오 ${customPresets.length + 1}`);
    if (!presetName) return;
    if (presetName.trim() === '') return;

    const newPreset: SimulationPreset = {
      name: presetName.trim(),
      totalUsers,
      exchangeRate,
      currencyMode,
      ratios,
      mixRatios,
      selectedModelBySlot,
      isCustom: true
    };

    const updated = [...customPresets, newPreset];
    setCustomPresets(updated);
    localStorage.setItem('ai_pricing_custom_presets', JSON.stringify(updated));
    alert(`🎉 프리셋 [${presetName}]이 로컬 브라우저 저장소에 성공적으로 저장되었습니다!`);
  };

  const handleDeletePreset = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('해당 프리셋을 삭제하시겠습니까?')) return;
    const updated = customPresets.filter((_, idx) => idx !== index);
    setCustomPresets(updated);
    localStorage.setItem('ai_pricing_custom_presets', JSON.stringify(updated));
  };


  const parseMarkdownData = (content: string) => {
    const lines = content.split(/\r?\n/);
    const parsedMetadata: Metadata = {};
    const parsedPricing: ModelPricing[] = [];
    const parsedPerformance: Record<string, PerformanceSpec> = {};
    const parsedNews: NewsEventsByProvider = {
      OpenAI: [],
      Anthropic: [],
      Google: []
    };
    const parsedTrend: { high: TrendPoint[]; mid: TrendPoint[] } = {
      high: [],
      mid: []
    };

    let currentSection = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('데이터 업데이트:') || trimmed.startsWith('데이터 업데이트 일시:')) {
        parsedMetadata.dataUpdatedAt = trimmed.replace(/^데이터 업데이트(?: 일시)?:/, '').trim();
        continue;
      }

      if (trimmed.startsWith('###')) {
        if (trimmed.includes('요금')) {
          currentSection = 'pricing';
        } else if (trimmed.includes('성능') || trimmed.includes('스펙')) {
          currentSection = 'performance';
        } else if (trimmed.includes('뉴스') || trimmed.includes('타임라인')) {
          currentSection = 'news';
        } else if (trimmed.includes('가격 추이') || trimmed.includes('가격 추세')) {
          currentSection = 'trend';
        }
        continue;
      }

      if (trimmed.startsWith('|')) {
        const parts = trimmed.split('|').map(p => p.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        if (parts.length === 0) continue;
        if (parts[0] === '' || parts[0].includes('제공사') || parts[0].includes('모델명') || parts[0].includes('등급') || parts[0].startsWith(':') || parts[0].startsWith('-')) {
          continue;
        }

        if (currentSection === 'pricing' && parts.length >= 5) {
          const provider = parts[0] as 'OpenAI' | 'Anthropic' | 'Google';
          const modelName = parts[1];
          const tier = parts[2] as 'high' | 'mid';
          const inputCost = parseFloat(parts[3].replace(/[$,\s]/g, ''));
          const outputCost = parseFloat(parts[4].replace(/[$,\s]/g, ''));
          if (modelName && !isNaN(inputCost) && !isNaN(outputCost)) {
            parsedPricing.push({ modelName, provider, tier, inputCostPer1M: inputCost, outputCostPer1M: outputCost });
          }
        } else if (currentSection === 'performance' && parts.length >= 6) {
          const modelName = parts[0];
          const context = parts[1];
          const maxOutput = parts[2];
          const valsIndex = parts[3];
          const sweBench = parts[4];
          const features = parts[5];
          if (modelName) {
            parsedPerformance[modelName] = { context, maxOutput, valsIndex, sweBench, features };
          }
        } else if (currentSection === 'news' && parts.length >= 4) {
          const provider = parts[0];
          const date = parts[1];
          const headline = parts[2];
          const detail = parts[3];
          if (isProviderName(provider)) {
            parsedNews[provider].push({ date, headline, content: detail });
          }
        } else if (currentSection === 'trend' && parts.length >= 5) {
          const tier = parts[0];
          const date = parts[1];
          const openai = parseFloat(parts[2].replace(/[$,\s]/g, ''));
          const anthropic = parseFloat(parts[3].replace(/[$,\s]/g, ''));
          const google = parseFloat(parts[4].replace(/[$,\s]/g, ''));

          if ((tier === 'high' || tier === 'mid') && date && !isNaN(openai) && !isNaN(anthropic) && !isNaN(google)) {
            parsedTrend[tier].push({
              date,
              week: date.slice(5).replace('-', '/'),
              OpenAI: openai,
              Anthropic: anthropic,
              Google: google
            });
          }
        }
      }
    }

    return { parsedMetadata, parsedPricing, parsedPerformance, parsedNews, parsedTrend };
  };

  const handleMarkdownUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      try {
        const { parsedMetadata, parsedPricing, parsedPerformance, parsedNews, parsedTrend } = parseMarkdownData(text);
        
        let updated = false;
        if (parsedMetadata.dataUpdatedAt) {
          setDataUpdatedAt(parsedMetadata.dataUpdatedAt);
          updated = true;
        }
        if (parsedPricing.length > 0) {
          setPricingData(parsedPricing);
          updated = true;
        }
        if (Object.keys(parsedPerformance).length > 0) {
          setPerformanceDb(parsedPerformance);
          updated = true;
        }
        if (parsedNews.OpenAI.length > 0 || parsedNews.Anthropic.length > 0 || parsedNews.Google.length > 0) {
          setNewsEvents(parsedNews);
          updated = true;
        }
        if (parsedTrend.high.length > 0 || parsedTrend.mid.length > 0) {
          setTrendData(parsedTrend);
          updated = true;
        }

        if (updated) {
          alert('🎉 데이터 갱신 완료!\n\n업로드된 마크다운 파일(.md)을 런타임 분석하여 모델 요금제, 성능 스펙 리더보드, 하단 뉴스 타임라인이 실시간으로 자동 갱신되었습니다.');
        } else {
          alert('⚠️ 경고: 유효한 데이터가 파싱되지 않았습니다. DATA_SPEC.md 포맷을 참고해 주세요.');
        }
      } catch (error) {
        console.error(error);
        alert('❌ 데이터 갱신 실패: 파일 구조가 올바른 마크다운 표 형태가 아닙니다.');
      }
    };
    reader.readAsText(file);
  };

  const providers: ProviderName[] = ['Google', 'OpenAI', 'Anthropic'];
  const tiers: ModelTier[] = ['high', 'mid'];

  const getModelOptions = (provider: ProviderName, tier: ModelTier) =>
    pricingData.filter(model => model.provider === provider && model.tier === tier);

  const getSelectedModelName = (provider: ProviderName, tier: ModelTier) => {
    const options = getModelOptions(provider, tier);
    const slotKey = `${provider}:${tier}` as const;
    const selected = selectedModelBySlot[slotKey];
    return options.some(model => model.modelName === selected) ? selected : options[0]?.modelName;
  };

  const filteredPricingData = providers.flatMap(provider =>
    tiers.flatMap(tier => {
      const selectedModelName = getSelectedModelName(provider, tier);
      const selectedModel = getModelOptions(provider, tier).find(model => model.modelName === selectedModelName);
      return selectedModel ? [selectedModel] : [];
    })
  );

  const handleSelectedModelChange = (provider: ProviderName, tier: ModelTier, modelName: string) => {
    setSelectedModelBySlot(prev => ({
      ...prev,
      [`${provider}:${tier}`]: modelName
    }));
  };

  // 3사 최상위 기존 모델 Input 토큰 가격 추세 데이터 (최근 6개월 / 1M 토큰당 USD)
  const fallbackFlagshipHistoryData = [
    { 
      week: '07/03', 
      OpenAI: 5.00, 
      Anthropic: 10.00, 
      Google: 7.00 
    },
    { 
      week: '07/10', 
      OpenAI: 5.00, 
      Anthropic: 10.00, 
      Google: 7.00 
    },
    { 
      week: '07/17', 
      OpenAI: 5.00, 
      Anthropic: 10.00, 
      Google: 1.25 
    }, // Google 1.5 Pro 가격 인하 시점
    { 
      week: '07/24', 
      OpenAI: 5.00, 
      Anthropic: 10.00, 
      Google: 1.25 
    },
    { 
      week: '07/31(현재)', 
      OpenAI: filteredPricingData.find(m => m.provider === 'OpenAI' && m.tier === 'high')?.inputCostPer1M ?? 5.00, 
      Anthropic: filteredPricingData.find(m => m.provider === 'Anthropic' && m.tier === 'high')?.inputCostPer1M ?? 5.00, 
      Google: 1.25 
    }
  ];

  // 3사 가성비 기존 모델 Input 토큰 가격 추세 데이터 (최근 6개월 / 1M 토큰당 USD)
  const fallbackBudgetHistoryData = [
    { week: '07/03', OpenAI: 1.00, Anthropic: 1.00, Google: 0.075 },
    { week: '07/10', OpenAI: 1.00, Anthropic: 1.00, Google: 0.075 },
    { week: '07/17', OpenAI: 1.00, Anthropic: 1.00, Google: 0.075 },
    { week: '07/24', OpenAI: 1.00, Anthropic: 1.00, Google: 0.075 },
    { 
      week: '07/31(현재)', 
      OpenAI: filteredPricingData.find(m => m.provider === 'OpenAI' && m.tier === 'mid')?.inputCostPer1M ?? 0.20, 
      Anthropic: filteredPricingData.find(m => m.provider === 'Anthropic' && m.tier === 'mid')?.inputCostPer1M ?? 1.00, 
      Google: 0.075 
    }
  ];

  const orderTrendDataByDate = (data: TrendPoint[]) =>
    [...data].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));

  const getRecentThreeMonthTrendData = (data: TrendPoint[]) => {
    if (!data.length) return data;
    const latestDate = data[data.length - 1].date;
    if (!latestDate) return data;
    const cutoff = new Date(`${latestDate}T00:00:00`);
    cutoff.setMonth(cutoff.getMonth() - 3);
    return data.filter(point => !point.date || new Date(`${point.date}T00:00:00`) >= cutoff);
  };

  const flagshipHistoryData = getRecentThreeMonthTrendData(orderTrendDataByDate(
    trendData.high.length ? trendData.high : fallbackFlagshipHistoryData
  ));
  const budgetHistoryData = getRecentThreeMonthTrendData(orderTrendDataByDate(
    trendData.mid.length ? trendData.mid : fallbackBudgetHistoryData
  ));

  const applySelectedModelPricesToLatestTrend = (tier: ModelTier, data: TrendPoint[]) => {
    if (!data.length) return data;

    return data.map((point, index) => {
      const nextPoint = { ...point };
      (['OpenAI', 'Anthropic', 'Google'] as ProviderName[]).forEach(provider => {
        const selectedModel = getSelectedModelName(provider, tier);
        const launchDate = selectedModel ? MODEL_LAUNCH_DATES[selectedModel] : undefined;
        if (launchDate && point.date && point.date < launchDate) {
          nextPoint[provider] = null;
        }
      });

      if (index !== data.length - 1) return nextPoint;

      return {
        ...nextPoint,
        OpenAI: filteredPricingData.find(model => model.provider === 'OpenAI' && model.tier === tier)?.inputCostPer1M ?? nextPoint.OpenAI,
        Anthropic: filteredPricingData.find(model => model.provider === 'Anthropic' && model.tier === tier)?.inputCostPer1M ?? nextPoint.Anthropic,
        Google: filteredPricingData.find(model => model.provider === 'Google' && model.tier === tier)?.inputCostPer1M ?? nextPoint.Google,
      };
    });
  };

  const selectedFlagshipHistoryData = applySelectedModelPricesToLatestTrend('high', flagshipHistoryData);
  const selectedBudgetHistoryData = applySelectedModelPricesToLatestTrend('mid', budgetHistoryData);

  const getTrendYAxisMax = (data: TrendPoint[]) => {
    const maxPrice = data.reduce((max, point) => {
      return Math.max(max, point.OpenAI ?? 0, point.Anthropic ?? 0, point.Google ?? 0);
    }, 0);

    return maxPrice > 0 ? Math.ceil(maxPrice * 1.1 * 100) / 100 : 1;
  };

  const flagshipYAxisMax = getTrendYAxisMax(selectedFlagshipHistoryData);
  const budgetYAxisMax = getTrendYAxisMax(selectedBudgetHistoryData);

  // Dynamic user token usages state
  const [tokenUsage, setTokenUsage] = useState<Record<UserType, UserTokenUsage>>(DEFAULT_TOKEN_USAGE);

  // Text buffer input cache for typing token numbers in 'k' units seamlessly
  const [tokenInputCache, setTokenInputCache] = useState<Record<string, string>>({
    'light-inputTokens': '300',
    'light-outputTokens': '75',
    'heavy-inputTokens': '1,500',
    'heavy-outputTokens': '400',
    'stdDev-inputTokens': '5,000',
    'stdDev-outputTokens': '1,000',
    'heavyDev-inputTokens': '20,000',
    'heavyDev-outputTokens': '4,000'
  });

  // Initialize and Fetch price constants / API simulation
  useEffect(() => {
    const agent = new PricingDataAgent();
    agent.fetchPricingData()
      .then((data) => {
        setPricingData(data);
      })
      .catch((err) => {
        console.error(err);
        setPricingData(agent.getPricingData());
      });
  }, []);

  const handleRatioChange = (type: UserType, value: number) => {
    const roundRatio = (num: number) => Math.round(num * 10) / 10;

    if (type === 'stdDev' || type === 'heavyDev') {
      const devTotal = developerRatio;
      const boundedValue = Math.max(0, Math.min(devTotal, value));
      const pairedType = type === 'stdDev' ? 'heavyDev' : 'stdDev';

      setRatios({
        ...ratios,
        [type]: roundRatio(boundedValue),
        [pairedType]: roundRatio(devTotal - boundedValue),
      });
      return;
    }

    const userTotal = 100 - developerRatio;
    const boundedValue = Math.max(0, Math.min(userTotal, value));
    const pairedType = type === 'light' ? 'heavy' : 'light';

    setRatios({
      ...ratios,
      [type]: roundRatio(boundedValue),
      [pairedType]: roundRatio(userTotal - boundedValue),
    });
  };

  const handleCountChange = (type: UserType, value: number) => {
    const devTotalCount = Math.round(totalUsers * (developerRatio / 100));
    const userTotalCount = totalUsers - devTotalCount;
    const boundedCount = type === 'stdDev' || type === 'heavyDev'
      ? Math.max(0, Math.min(devTotalCount, value))
      : Math.max(0, Math.min(userTotalCount, value));
    const targetPercent = totalUsers > 0 ? (boundedCount / totalUsers) * 100 : 0;

    handleRatioChange(type, targetPercent);
  };

  const handleDeveloperRatioChange = (value: number) => {
    const val = Math.max(0, Math.min(100, value));
    setDeveloperRatio(val);

    const devTotal = val;
    const nonDevTotal = 100 - val;

    const currentDevSum = ratios.stdDev + ratios.heavyDev;
    const currentNonDevSum = ratios.light + ratios.heavy;

    const stdDevFactor = currentDevSum > 0 ? ratios.stdDev / currentDevSum : 0.67;
    const lightFactor = currentNonDevSum > 0 ? ratios.light / currentNonDevSum : 0.71;

    const newRatios = { ...ratios };

    newRatios.stdDev = Math.round(devTotal * stdDevFactor);
    newRatios.heavyDev = devTotal - newRatios.stdDev;

    newRatios.light = Math.round(nonDevTotal * lightFactor);
    newRatios.heavy = nonDevTotal - newRatios.light;

    setRatios(newRatios);
  };

  const handleTokenInputChange = (type: UserType, field: 'inputTokens' | 'outputTokens', rawValue: string) => {
    const cacheKey = `${type}-${field}`;
    setTokenInputCache(prev => ({ ...prev, [cacheKey]: rawValue }));

    const cleanVal = rawValue.replace(/,/g, '');
    const parsed = parseInt(cleanVal, 10);
    
    if (!isNaN(parsed) && parsed >= 0) {
      setTokenUsage(prev => ({
        ...prev,
        [type]: {
          ...prev[type],
          [field]: parsed * 1000
        }
      }));
    }
  };

  const handleTokenInputBlur = (type: UserType, field: 'inputTokens' | 'outputTokens') => {
    const cacheKey = `${type}-${field}`;
    const currentValue = tokenUsage[type][field] / 1000;
    setTokenInputCache(prev => ({
      ...prev,
      [cacheKey]: formatComma(currentValue)
    }));
  };

  const formatComma = (num: number) => {
    if (num === undefined || num === null || isNaN(num)) return '';
    return new Intl.NumberFormat().format(num);
  };

  const parseComma = (str: string) => {
    const cleanStr = str.replace(/,/g, '');
    return parseInt(cleanStr, 10) || 0;
  };

  const formatKoreanTokenCount = (tokens: number) => {
    if (tokens === undefined || tokens === null || isNaN(tokens)) return '0';
    if (tokens >= 10000) {
      const val = tokens / 10000;
      return `${Number(val.toFixed(1))}만`;
    }
    return `${tokens}`;
  };

  const handleMixRatioChange = (provider: 'OpenAI' | 'Anthropic' | 'Google', tier: 'high' | 'mid', value: number) => {
    const agent = new UIStateAgent();
    const updatedMix = agent.adjustModelMix(mixRatios[provider], tier, value);
    
    if (syncModelMixRatios) {
      // Synchronize all three providers to have the exact same model tier mix ratio
      setMixRatios({
        OpenAI: updatedMix,
        Anthropic: updatedMix,
        Google: updatedMix
      });
    } else {
      // Update only the chosen provider
      setMixRatios({
        ...mixRatios,
        [provider]: updatedMix
      });
    }
  };

  // Execute Simulation Engine (calculates both individual and provider blended costs)
  const engine = new SimulationEngineAgent();
  const { results, providerResults, summary } = engine.runSimulation(
    totalUsers,
    ratios,
    filteredPricingData,
    exchangeRate,
    mixRatios,
    tokenUsage
  );

  const handleExportReport = () => {
    let report = `# 📊 AI Cost Simulation Report (AI 인프라 운용 비용 분석 리포트)\n\n`;
    report += `> **시뮬레이터 생성 일시:** ${new Date().toLocaleString()}\n`;
    report += `> **데이터 최근 갱신 기준:** ${dataUpdatedAt}\n\n`;
    
    report += `## 1. ⚙️ 시뮬레이션 주요 입력 매개변수\n`;
    report += `- **총 운용 사용자 (명):** ${totalUsers.toLocaleString()} 명\n`;
    report += `- **달러 적용 환율 (원):** ₩${exchangeRate.toLocaleString()} / USD\n`;
    report += `- **비용 환산 모드:** ${currencyMode} 기준\n`;
    report += `- **선택 모델 설정:**\n`;
    report += `  - OpenAI 최상위 타겟: \`${getSelectedModelName('OpenAI', 'high')}\`\n`;
    report += `  - Anthropic 최상위 타겟: \`${getSelectedModelName('Anthropic', 'high')}\`\n\n`;

    report += `### 👥 유저 세그먼트 구성 및 토큰 사용량\n`;
    report += `| 유저 등급 | 인원수 (명) | 점유율 (%) | 월간 Input 토큰 | 월간 Output 토큰 |\n`;
    report += `| :--- | :---: | :---: | :---: | :---: |\n`;
    report += `| 일반 라이트 유저 | ${(Math.round(totalUsers * (ratios.light / 100))).toLocaleString()}명 | ${ratios.light}% | 15k | 5k |\n`;
    report += `| 일반 헤비 유저 | ${(Math.round(totalUsers * (ratios.heavy / 100))).toLocaleString()}명 | ${ratios.heavy}% | 150k | 50k |\n`;
    report += `| 일반 개발자 | ${(Math.round(totalUsers * (ratios.stdDev / 100))).toLocaleString()}명 | ${ratios.stdDev}% | 300k | 100k |\n`;
    report += `| 전문 에이전트 / 헤비 개발자 | ${(Math.round(totalUsers * (ratios.heavyDev / 100))).toLocaleString()}명 | ${ratios.heavyDev}% | 1.5M | 0.5M |\n\n`;

    report += `### 🤖 서비스 제공사별 혼합 믹스 비율 (High-tier vs Mid-tier)\n`;
    report += `| 제공사 | 최상위 모델 비율 | 가성비 모델 비율 |\n`;
    report += `| :--- | :---: | :---: |\n`;
    report += `| OpenAI | ${mixRatios.OpenAI.high}% | ${mixRatios.OpenAI.mid}% |\n`;
    report += `| Anthropic | ${mixRatios.Anthropic.high}% | ${mixRatios.Anthropic.mid}% |\n`;
    report += `| Google | ${mixRatios.Google.high}% | ${mixRatios.Google.mid}% |\n\n`;

    report += `---\n\n`;
    
    report += `## 2. 💵 제공사별 총 운용 비용 요약 (Total Cost Summary)\n`;
    report += `| 제공사 | 월간 총 비용 (USD) | 월간 총 비용 (KRW) | 1인당 평균 비용 (KRW) |\n`;
    report += `| :--- | :---: | :---: | :---: |\n`;
    providerResults.forEach(res => {
      const avgKrw = res.krwCost / totalUsers;
      report += `| **${res.provider}** | $${res.usdCost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} | ₩${Math.round(res.krwCost).toLocaleString()} | ₩${Math.round(avgKrw).toLocaleString()} |\n`;
    });
    report += `\n`;
    
    report += `---\n\n`;

    report += `## 3. 📋 세부 구성 모델별 요율 및 요금 상세 내역\n`;
    report += `| 제공사 | 모델명 | 등급 | 입력 단가 ($/1M) | 출력 단가 ($/1M) | 월간 예상 USD | 월간 예상 KRW |\n`;
    report += `| :--- | :--- | :---: | :---: | :---: | :---: | :---: |\n`;
    results.forEach(m => {
      report += `| ${m.provider} | ${m.modelName} | ${m.tier === 'high' ? '최상위' : '가성비'} | $${m.inputCostPer1M.toFixed(3)} | $${m.outputCostPer1M.toFixed(2)} | $${m.usdCost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} | ₩${Math.round(m.krwCost).toLocaleString()} |\n`;
    });
    report += `\n`;

    report += `> 본 보고서는 **JP AI Pricing Simulator** 시스템에 의해 정적 연산된 비용 지표입니다.\n`;
    report += `> 환율 변동 및 제공사 공식 단가 인하 마일스톤에 따라 비용이 변동될 수 있습니다.\n`;

    const blob = new Blob([report], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `AI_Pricing_Simulator_Report_${new Date().toISOString().slice(0, 10)}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCapturePng = () => {
    const captureArea = document.getElementById('dashboard-result-area');
    if (!captureArea) {
      alert('❌ 캡처 대상 영역(dashboard-result-area)을 찾을 수 없습니다.');
      return;
    }

    const runCapture = (html2canvasLib: any) => {
      setTimeout(() => {
        // Stage 1: Standard high-res rendering with CORS & SVG taint handling
        html2canvasLib(captureArea, {
          useCORS: true,
          allowTaint: false,
          scale: 1.5,
          backgroundColor: '#070a13',
          logging: false,
          ignoreElements: (element: HTMLElement) => {
            return (
              element.tagName === 'BUTTON' ||
              element.tagName === 'INPUT' ||
              element.classList.contains('no-print') ||
              element.classList.contains('animate-pulse') ||
              element.classList.contains('animate-spin')
            );
          },
          onclone: (clonedDoc: Document) => {
            const svgElements = clonedDoc.querySelectorAll('svg');
            svgElements.forEach(svg => {
              const defs = svg.querySelectorAll('defs');
              defs.forEach(d => d.remove());

              const paths = svg.querySelectorAll('path, rect, circle, line');
              paths.forEach(p => {
                const stroke = p.getAttribute('stroke');
                const fill = p.getAttribute('fill');
                if (stroke && stroke.includes('url(')) {
                  p.setAttribute('stroke', '#6366f1');
                }
                if (fill && fill.includes('url(')) {
                  p.setAttribute('fill', '#1e293b');
                }
              });
            });
          }
        }).then((canvas: HTMLCanvasElement) => {
          const link = document.createElement('a');
          link.href = canvas.toDataURL('image/png');
          link.download = `AI_Cost_Simulator_Result_${new Date().toISOString().slice(0, 10)}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }).catch((err1: any) => {
          console.warn('Stage 1 capture failed, running Stage 2 fallback without complex SVGs:', err1);
          
          // Stage 2 Fallback: Purify all SVGs and render result cards securely
          html2canvasLib(captureArea, {
            useCORS: false,
            allowTaint: true,
            scale: 1,
            backgroundColor: '#070a13',
            logging: false,
            onclone: (clonedDoc: Document) => {
              const svgs = clonedDoc.querySelectorAll('svg');
              svgs.forEach(s => s.remove()); // Remove SVGs to avoid any browser canvas tainting
            }
          }).then((canvas: HTMLCanvasElement) => {
            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/png');
            link.download = `AI_Cost_Simulator_Result_${new Date().toISOString().slice(0, 10)}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }).catch((err2: any) => {
            console.error('Stage 2 fallback failed', err2);
            alert('💡 보안 정책으로 인해 이미지 스냅샷 생성이 거부되었습니다. [📄 PDF 인쇄/저장] 버튼을 누르면 고화질 리포트로 저장할 수 있습니다!');
          });
        });
      }, 200);
    };

    const globalHtml2canvas = (window as any).html2canvas;
    if (globalHtml2canvas) {
      runCapture(globalHtml2canvas);
    } else {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      script.async = true;
      script.onload = () => {
        const loadedLib = (window as any).html2canvas;
        if (loadedLib) {
          runCapture(loadedLib);
        } else {
          alert('❌ html2canvas 라이브러리 로드 실패. [📄 PDF 인쇄/저장]을 대신 이용해 주세요.');
        }
      };
      script.onerror = () => {
        alert('❌ CDN 스크립트 접근 차단. [📄 PDF 인쇄/저장]을 대신 이용해 주세요.');
      };
      document.head.appendChild(script);
    }
  };

  const handlePrintPdf = () => {
    window.print();
  };

  // Formatting helpers
  const formatNumber = (num: number, maxDecimals: number = 0) => {
    return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: maxDecimals }).format(num);
  };

  const formatCurrency = (amount: number, currency: 'USD' | 'KRW') => {
    if (currency === 'USD') {
      return `$${formatNumber(amount, 0)}`;
    }
    return `₩${formatNumber(amount, 0)}`;
  };

  const toFiniteNumber = (value: ChartValue) => {
    const rawValue = Array.isArray(value) ? value[0] : value;
    const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    return Number.isFinite(numericValue) ? numericValue : 0;
  };

  const formatDollarTooltip = (value: ChartValue, decimals: number) => {
    return [`$${toFiniteNumber(value).toFixed(decimals)}`, ''];
  };

  // Mapping providers to specific branding colors
  const getProviderColor = (provider: string) => {
    switch (provider) {
      case 'OpenAI': return '#10a37f'; // OpenAI Emerald
      case 'Anthropic': return '#f37022'; // Anthropic Peach/Amber
      case 'Google': return '#4285f4'; // Google Blue
      default: return '#6366f1';
    }
  };

  const getProviderBgColor = (provider: string) => {
    switch (provider) {
      case 'OpenAI': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'Anthropic': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'Google': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      default: return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
    }
  };

  // Identify high/mid models name per provider for the UI labels
  const getModelNameByTier = (provider: string, tier: 'high' | 'mid') => {
    const model = filteredPricingData.find(m => m.provider === provider && m.tier === tier);
    return model ? model.modelName : tier === 'high' ? '최상위' : '가성비';
  };

  const getLatestTrendPrice = (provider: ProviderName, data: TrendPoint[]) => {
    const latestPoint = data[data.length - 1];
    return latestPoint ? latestPoint[provider] : Number.POSITIVE_INFINITY;
  };

  const getSelectedModelPrice = (provider: ProviderName, tier: ModelTier) => {
    const model = filteredPricingData.find(item => item.provider === provider && item.tier === tier);
    return model?.inputCostPer1M ?? Number.POSITIVE_INFINITY;
  };

  const getSortedTrendLines = (tier: ModelTier, data: TrendPoint[]) =>
    providers
      .map(provider => ({
        provider,
        modelName: getModelNameByTier(provider, tier),
        latestPrice: getSelectedModelPrice(provider, tier),
        trendPrice: getLatestTrendPrice(provider, data),
        color: getProviderColor(provider),
      }))
      .sort((a, b) => a.latestPrice - b.latestPrice);

  const highTrendLines = getSortedTrendLines('high', selectedFlagshipHistoryData);
  const midTrendLines = getSortedTrendLines('mid', selectedBudgetHistoryData);

  const renderPriceSortedLegend = (
    lines: Array<{ provider: ProviderName; modelName: string; latestPrice: number; color: string }>
  ) => (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-2 text-[10px]">
      {lines.map(line => (
        <div key={line.provider} className="flex items-center gap-1.5 font-mono text-slate-300">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: line.color }} />
          <span>{line.modelName}</span>
          <span className="text-slate-500">${line.latestPrice.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );

  // Prepare chart dataset sorted explicitly: Google -> OpenAI -> Anthropic
  const providerOrder: Record<string, number> = { Google: 0, OpenAI: 1, Anthropic: 2 };
  
  const sortedResults = [...results].sort((a, b) => providerOrder[a.provider] - providerOrder[b.provider]);
  const sortedProviderResults = [...providerResults].sort((a, b) => providerOrder[a.provider] - providerOrder[b.provider]);

  const chartData = chartMode === 'individual'
    ? sortedResults.map(r => {
        const mix = mixRatios[r.provider] || { high: 50, mid: 50 };
        const ratio = r.tier === 'high' ? mix.high : mix.mid;
        const ratioMultiplier = ratio / 100;
        
        const weightedUsd = r.usdCost * ratioMultiplier;
        const weightedKrw = r.krwCost * ratioMultiplier;

        return {
          name: `${r.modelName} (${ratio}%)`,
          cost: currencyMode === 'USD' ? Math.round(weightedUsd) : Math.round(weightedKrw),
          usdCost: Math.round(weightedUsd),
          krwCost: Math.round(weightedKrw),
          provider: r.provider,
          tierLabel: `${r.tier === 'high' ? '최상위' : '가성비'} (${ratio}%)`
        };
      })
    : sortedProviderResults.map(p => ({
        name: p.provider,
        cost: currencyMode === 'USD' ? p.usdCost : p.krwCost,
        usdCost: p.usdCost,
        krwCost: p.krwCost,
        provider: p.provider,
        tierLabel: `최상위 ${p.highRatio}% / 가성비 ${p.midRatio}%`
      }));

  return (
    <div className="min-h-screen bg-[#070a13] bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-950/20 via-[#070a13] to-[#070a13] text-slate-100 p-6 md:p-10 font-sans">
      <style>{`
        @media print {
          /* Hide all control panels, preset bars, files uploader, headers, and footer */
          header,
          footer,
          .no-print,
          section.mb-8, /* preset quickbar */
          button,
          input,
          select,
          .hidden,
          .flex.items-center.gap-2.text-\\[10px\\], /* version tags */
          div.mb-6.flex.flex-wrap { /* inline configuration selectors */
            display: none !important;
          }

          /* Force A4 print layout to fit print width with high legibility */
          #dashboard-capture-area {
            display: grid !important;
            grid-template-columns: 1fr !important;
            gap: 1.5rem !important;
            width: 100% !important;
            max-width: 100% !important;
            background: #ffffff !important;
            color: #0f172a !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          /* Invert card borders and slate dark colors to white paper formats */
          .bg-slate-900\\/40,
          .bg-slate-900\\/30,
          .bg-slate-950\\/40,
          .bg-slate-950\\/20 {
            background-color: #ffffff !important;
            background: #ffffff !important;
            border: 1px solid #cbd5e1 !important;
            color: #0f172a !important;
            box-shadow: none !important;
          }

          .text-slate-100,
          .text-slate-200,
          .text-slate-300,
          .text-white {
            color: #0f172a !important;
          }

          .text-slate-400,
          .text-slate-500 {
            color: #475569 !important;
          }
          
          /* Keep visual borders visible on tables during PDF generation */
          table, th, td {
            border-color: #e2e8f0 !important;
            color: #0f172a !important;
          }
        }
      `}</style>
      
      {/* 1. Header Area */}
      <header className="max-w-7xl mx-auto mb-10 text-center md:text-left flex flex-col md:flex-row md:items-center md:justify-between gap-6 border-b border-slate-800/60 pb-8">
        <div>
          <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
            <Sparkles className="w-6 h-6 text-indigo-400 animate-pulse" />
            <span className="text-indigo-400 font-bold uppercase tracking-widest text-xs">Multi-Agent Cost Balancer</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-slate-400 tracking-tight">
            AI 서비스별 월간 예상 비용 계산기
          </h1>
          <p className="text-slate-400 mt-2 text-sm md:text-base max-w-3xl">
            사용자 구성비 및 각 회사별 <strong>[최상위 vs 가성비 모델 사용 비율]</strong>을 실시간 반영하여 혼합 운용 비용 산정
          </p>
        </div>

        {/* Real-time sync status & Version Info */}
        <div className="flex flex-col items-start md:items-end gap-2.5">
          <div className="flex items-center gap-2 text-[10px] text-slate-400 bg-slate-950/80 border border-slate-800/60 px-2.5 py-1 rounded-full font-mono">
            <span className="font-bold text-indigo-400">v1.4.0</span>
            <span className="w-1 h-1 bg-slate-700 rounded-full"></span>
            <span>앱 업데이트: {APP_UPDATED_AT}</span>
            <span className="w-1 h-1 bg-slate-700 rounded-full"></span>
            <span>데이터 업데이트: {dataUpdatedAt}</span>
          </div>
          <div className="flex items-center gap-3">

            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleMarkdownUpload} 
              className="hidden" 
              accept=".md" 
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 border border-indigo-500/30 text-white shadow-lg rounded-lg text-xs font-bold transition-all duration-200"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>데이터 갱신 (.md)</span>
            </button>
            <div className="text-right hidden sm:block">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Markdown Engine Active
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* 💾 나만의 시뮬레이션 프리셋 저장 & 리포트 다운로드 (Preset & Export) Quick Bar */}
      <section className="max-w-7xl mx-auto mb-8 bg-slate-900/40 backdrop-blur-md border border-slate-800/80 rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-bold text-slate-400 mr-2 flex items-center gap-1.5 font-mono">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            시나리오 프리셋:
          </span>
          {/* 시스템 내장 프리셋 버튼 */}
          {SYSTEM_PRESETS.map((preset, idx) => (
            <button
              key={`sys-${idx}`}
              onClick={() => applyPreset(preset)}
              className="px-3 py-1.5 bg-slate-950/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 active:bg-slate-900 text-slate-300 hover:text-white rounded-lg text-xs font-semibold transition-all duration-200 shadow"
            >
              {preset.name}
            </button>
          ))}

          {/* 사용자가 직접 저장한 커스텀 프리셋 목록 */}
          {customPresets.length > 0 && (
            <div className="flex flex-wrap items-center gap-2.5 border-l border-slate-800 pl-3">
              {customPresets.map((preset, idx) => (
                <div
                  key={`custom-${idx}`}
                  onClick={() => applyPreset(preset)}
                  className="group flex items-center gap-1 px-3 py-1.5 bg-indigo-950/40 hover:bg-indigo-900/40 border border-indigo-900/60 hover:border-indigo-800 active:bg-indigo-950/60 text-indigo-200 hover:text-white rounded-lg text-xs font-semibold transition-all duration-200 shadow cursor-pointer"
                >
                  <span>{preset.name}</span>
                  <button
                    onClick={(e) => handleDeletePreset(idx, e)}
                    className="text-indigo-400 hover:text-red-400 ml-1 opacity-60 group-hover:opacity-100 transition-opacity font-bold font-mono text-[9px] w-3 h-3 flex items-center justify-center bg-slate-950/40 hover:bg-slate-950 rounded-full"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 ml-auto">
          <button
            onClick={handleSavePreset}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-slate-200 hover:text-white rounded-lg text-xs font-bold transition-all duration-200 shadow"
          >
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span>현재 설정 저장</span>
          </button>
          <button
            onClick={handleExportReport}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-slate-200 hover:text-white rounded-lg text-xs font-bold transition-all duration-200 shadow"
          >
            <span>리포트 내보내기 (.md)</span>
          </button>
          <button
            onClick={handleCapturePng}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-slate-200 hover:text-white rounded-lg text-xs font-bold transition-all duration-200 shadow"
          >
            <span>📸 PNG 스냅샷</span>
          </button>
          <button
            onClick={handlePrintPdf}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 active:from-indigo-700 active:to-violet-700 text-white rounded-lg text-xs font-extrabold transition-all duration-200 shadow-md"
          >
            <span>📄 PDF 인쇄/저장</span>
          </button>
        </div>
      </section>

      {/* Main Layout Grid */}
      <main id="dashboard-capture-area" className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Left Side: Inputs & UI-State-Agent Controls (5 cols) */}
        <section className="lg:col-span-5 flex flex-col gap-6 no-print">
          
          {/* Base Parameters Card */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-200 mb-5 flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-400" />
              <span>시뮬레이션 기본 파라미터</span>
            </h2>

            {/* Total Users Input */}
            <div className="mb-5">
              <label htmlFor="total-users" className="block text-slate-400 text-xs font-semibold mb-2 uppercase tracking-wider">
                총 사용자 수 (인원)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Users className="h-5 h-5 text-slate-500" />
                </div>
                <input
                  id="total-users"
                  type="text"
                  value={formatComma(totalUsers)}
                  onChange={(e) => setTotalUsers(Math.max(1, parseComma(e.target.value)))}
                  className="block w-full pl-10 pr-4 py-3 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-semibold"
                />
              </div>
            </div>

            {/* Exchange Rate Input */}
            <div>
              <label htmlFor="exchange-rate" className="block text-slate-400 text-xs font-semibold mb-2 uppercase tracking-wider">
                달러 환율 (KRW/USD)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <DollarSign className="h-5 h-5 text-slate-500" />
                </div>
                <input
                  id="exchange-rate"
                  type="text"
                  value={formatComma(exchangeRate)}
                  onChange={(e) => setExchangeRate(Math.max(1, parseComma(e.target.value)))}
                  className="block w-full pl-10 pr-4 py-3 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-semibold"
                />
              </div>
            </div>
          </div>

          {/* Ratios & UI-State-Agent Card (User Cohorts) */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                <Award className="w-5 h-5 text-indigo-400" />
                <span>유저 구성 비율 조정 (%)</span>
              </h2>
              <span className="text-xs px-2.5 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700/60 font-mono">
                합계: 100% 자동 유지
              </span>
            </div>

            <p className="text-slate-400 text-xs mb-5 leading-relaxed">
              임의의 3가지 값을 조작하면, UI-State-Agent가 나머지 1가지 비율을 최적화하여 자동으로 총합 100%를 보정합니다.
            </p>

            {/* Master Developer Ratio Controller */}
            <div className="mb-6 pb-6 border-b border-slate-850 bg-indigo-500/5 -mx-6 px-6 py-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-indigo-300 flex items-center gap-1.5">
                    <GitCompare className="w-4 h-4" />
                    <span>개발자 총합 비율</span>
                  </span>
                  <span className="text-[10px] text-slate-500">개발 유저 + 헤비개발 유저의 비중 합계</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={formatComma(Math.round(totalUsers * (developerRatio / 100)))}
                    onChange={(e) => handleDeveloperRatioChange(Math.round((parseComma(e.target.value) / totalUsers) * 100))}
                    className="w-20 px-1.5 py-0.5 text-right bg-slate-950 border border-slate-800 rounded text-slate-300 font-semibold font-mono text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <span className="text-slate-500 text-xs">명</span>
                  <span className="text-indigo-400 text-xs font-bold font-mono ml-1">
                    ({developerRatio}%)
                  </span>
                </div>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={developerRatio}
                onChange={(e) => handleDeveloperRatioChange(parseInt(e.target.value, 10))}
                className="w-full h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>

            {/* Proportions Sliders (2 Columns Layout) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column: Non-Developer Cohorts */}
              <div className="space-y-6">
                {/* 1. Light User */}
                <div className="space-y-2">
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-slate-200">일반 유저 (Light User)</span>
                      <span className="text-[10px] text-slate-400">월 Input {formatKoreanTokenCount(tokenUsage.light.inputTokens)} / Output {formatKoreanTokenCount(tokenUsage.light.outputTokens)} 토큰</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={formatComma(Math.round(totalUsers * (ratios.light / 100)))}
                        onChange={(e) => handleCountChange('light', parseComma(e.target.value))}
                        className="w-24 px-2 py-0.5 text-right bg-slate-950 border border-slate-800 rounded text-slate-300 font-semibold font-mono text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <span className="text-slate-400 text-xs font-semibold">명</span>
                      <span className="text-emerald-400 text-xs font-bold font-mono ml-1">
                        ({ratios.light}%)
                      </span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={100 - developerRatio}
                    step="0.1"
                    value={ratios.light}
                    onChange={(e) => handleRatioChange('light', parseFloat(e.target.value))}
                    className="w-full accent-emerald-500 bg-slate-950 rounded-lg cursor-pointer h-1.5"
                  />
                </div>

                {/* 2. Heavy User */}
                <div className="space-y-2">
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-slate-200">헤비 유저 (Heavy User)</span>
                      <span className="text-[10px] text-slate-400">월 Input {formatKoreanTokenCount(tokenUsage.heavy.inputTokens)} / Output {formatKoreanTokenCount(tokenUsage.heavy.outputTokens)} 토큰</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={formatComma(Math.round(totalUsers * (ratios.heavy / 100)))}
                        onChange={(e) => handleCountChange('heavy', parseComma(e.target.value))}
                        className="w-24 px-2 py-0.5 text-right bg-slate-950 border border-slate-800 rounded text-slate-300 font-semibold font-mono text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <span className="text-slate-400 text-xs font-semibold">명</span>
                      <span className="text-amber-400 text-xs font-bold font-mono ml-1">
                        ({ratios.heavy}%)
                      </span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={100 - developerRatio}
                    step="0.1"
                    value={ratios.heavy}
                    onChange={(e) => handleRatioChange('heavy', parseFloat(e.target.value))}
                    className="w-full accent-amber-500 bg-slate-950 rounded-lg cursor-pointer h-1.5"
                  />
                </div>
              </div>

              {/* Right Column: Developer Cohorts */}
              <div className="space-y-6">
                {/* 3. Standard Developer */}
                <div className="space-y-2">
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-slate-200">일반 개발자 (Standard Dev)</span>
                      <span className="text-[10px] text-slate-400">월 Input {formatKoreanTokenCount(tokenUsage.stdDev.inputTokens)} / Output {formatKoreanTokenCount(tokenUsage.stdDev.outputTokens)} 토큰</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={formatComma(Math.round(totalUsers * (ratios.stdDev / 100)))}
                        onChange={(e) => handleCountChange('stdDev', parseComma(e.target.value))}
                        className="w-24 px-2 py-0.5 text-right bg-slate-950 border border-slate-800 rounded text-slate-300 font-semibold font-mono text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <span className="text-slate-400 text-xs font-semibold">명</span>
                      <span className="text-blue-400 text-xs font-bold font-mono ml-1">
                        ({ratios.stdDev}%)
                      </span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={developerRatio}
                    step="0.1"
                    value={ratios.stdDev}
                    onChange={(e) => handleRatioChange('stdDev', parseFloat(e.target.value))}
                    className="w-full accent-blue-500 bg-slate-950 rounded-lg cursor-pointer h-1.5"
                  />
                </div>

                {/* 4. Heavy Developer */}
                <div className="space-y-2">
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-slate-200">헤비 개발자 (Heavy Dev)</span>
                      <span className="text-[10px] text-slate-400">월 Input {formatKoreanTokenCount(tokenUsage.heavyDev.inputTokens)} / Output {formatKoreanTokenCount(tokenUsage.heavyDev.outputTokens)} 토큰</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={formatComma(Math.round(totalUsers * (ratios.heavyDev / 100)))}
                        onChange={(e) => handleCountChange('heavyDev', parseComma(e.target.value))}
                        className="w-24 px-2 py-0.5 text-right bg-slate-950 border border-slate-800 rounded text-slate-300 font-semibold font-mono text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <span className="text-slate-400 text-xs font-semibold">명</span>
                      <span className="text-purple-400 text-xs font-bold font-mono ml-1">
                        ({ratios.heavyDev}%)
                      </span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={developerRatio}
                    step="0.1"
                    value={ratios.heavyDev}
                    onChange={(e) => handleRatioChange('heavyDev', parseFloat(e.target.value))}
                    className="w-full accent-purple-500 bg-slate-950 rounded-lg cursor-pointer h-1.5"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Model Mix Ratios Control Panel (Added) */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                <GitCompare className="w-5 h-5 text-indigo-400" />
                <span>최상위 vs 가성비 모델 비율 설정</span>
              </h2>
              
              {/* Sync Toggle Controls */}
              <div className="inline-flex bg-slate-950 p-0.5 rounded-lg border border-slate-800/80">
                <button
                  onClick={() => {
                    setSyncModelMixRatios(true);
                    // On enable sync, synchronize all to OpenAI's current mix for ease of transition
                    setMixRatios({
                      OpenAI: mixRatios.OpenAI,
                      Anthropic: mixRatios.OpenAI,
                      Google: mixRatios.OpenAI
                    });
                  }}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all duration-200 ${syncModelMixRatios ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  함께 움직이기
                </button>
                <button
                  onClick={() => setSyncModelMixRatios(false)}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all duration-200 ${!syncModelMixRatios ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  따로 움직이기
                </button>
              </div>
            </div>
            <p className="text-slate-400 text-xs mb-5">
              각 회사 내에서 최상위 모델과 가성비 모델을 어떤 비율(%)로 조합해 사용할 것인지 지정합니다. (합계 100% 자동 유지)
            </p>

            <div className="space-y-6">
              {/* OpenAI mix */}
              <div className="p-4 bg-slate-950/40 border border-slate-800/60 rounded-xl">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-bold text-[#10a37f]">OpenAI (ChatGPT)</span>
                  <div className="flex gap-4 text-xs font-mono text-slate-400 font-semibold">
                    <span>최상위: {mixRatios.OpenAI.high}%</span>
                    <span>가성비: {mixRatios.OpenAI.mid}%</span>
                  </div>
                </div>

                <div className="text-[10px] text-slate-500 mb-3 font-semibold font-mono">
                  {getModelNameByTier('OpenAI', 'high')} (최상위) vs {getModelNameByTier('OpenAI', 'mid')} (가성비)
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={mixRatios.OpenAI.high}
                  onChange={(e) => handleMixRatioChange('OpenAI', 'high', parseInt(e.target.value))}
                  className="w-full accent-[#10a37f] bg-slate-950 rounded-lg cursor-pointer h-1.5"
                />
              </div>

              {/* Anthropic mix */}
              <div className="p-4 bg-slate-950/40 border border-slate-800/60 rounded-xl">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-bold text-[#f37022]">Anthropic (Claude)</span>
                  <div className="flex gap-4 text-xs font-mono text-slate-400 font-semibold">
                    <span>최상위: {mixRatios.Anthropic.high}%</span>
                    <span>가성비: {mixRatios.Anthropic.mid}%</span>
                  </div>
                </div>

                <div className="text-[10px] text-slate-500 mb-3 font-semibold font-mono">
                  {getModelNameByTier('Anthropic', 'high')} (최상위) vs {getModelNameByTier('Anthropic', 'mid')} (가성비)
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={mixRatios.Anthropic.high}
                  onChange={(e) => handleMixRatioChange('Anthropic', 'high', parseInt(e.target.value))}
                  className="w-full accent-[#f37022] bg-slate-950 rounded-lg cursor-pointer h-1.5"
                />
              </div>

              {/* Google mix */}
              <div className="p-4 bg-slate-950/40 border border-slate-800/60 rounded-xl">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-bold text-[#4285f4]">Google (Gemini)</span>
                  <div className="flex gap-4 text-xs font-mono text-slate-400 font-semibold">
                    <span>최상위: {mixRatios.Google.high}%</span>
                    <span>가성비: {mixRatios.Google.mid}%</span>
                  </div>
                </div>
                <div className="text-[10px] text-slate-500 mb-3 font-semibold font-mono">
                  {getModelNameByTier('Google', 'high')} (최상위) vs {getModelNameByTier('Google', 'mid')} (가성비)
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={mixRatios.Google.high}
                  onChange={(e) => handleMixRatioChange('Google', 'high', parseInt(e.target.value))}
                  className="w-full accent-[#4285f4] bg-slate-950 rounded-lg cursor-pointer h-1.5"
                />
              </div>
            </div>
          </div>

        </section>

        {/* Right Side: Simulation Results & Visuals (7 cols) */}
        <section id="dashboard-result-area" className="lg:col-span-7 flex flex-col gap-6">

          {/* 2. Summary Dashboard Cards (Updated to Provider Blended Comparison) */}
          {summary && providerResults.length > 0 && (() => {
            const sortedBlended = [...providerResults].sort((a, b) => a.usdCost - b.usdCost);
            const minProv = sortedBlended[0];
            const midProv = sortedBlended[1];
            const maxProv = sortedBlended[2];

            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* 1. Cheapest Provider Card (MIN) */}
                <div className="bg-gradient-to-br from-emerald-950/20 to-slate-900/50 backdrop-blur-md border border-emerald-500/15 rounded-2xl p-5 shadow-xl relative overflow-hidden group hover:border-emerald-500/35 transition-all duration-300">
                  <div className="absolute top-3 right-3 text-emerald-400/20 font-extrabold text-3xl font-mono">MIN</div>
                  <span className="text-emerald-400 text-xs font-bold uppercase tracking-wider">최저 월비용 (혼합)</span>
                  <h3 className="text-xl font-bold text-white mt-1">{minProv.provider}</h3>
                  <p className="text-slate-400 text-xs">
                    최상위 {minProv.highRatio}% / 가성비 {minProv.midRatio}%
                  </p>
                  <div className="mt-4">
                    <div className="text-2xl font-black text-emerald-400">
                      {formatCurrency(minProv.usdCost, 'USD')}<span className="text-xs font-semibold text-slate-400 ml-1">/월</span>
                    </div>
                    <div className="text-sm text-slate-400 mt-0.5 font-medium">
                      ({formatCurrency(minProv.krwCost, 'KRW')} /월)
                    </div>
                  </div>
                </div>

                {/* 2. Medium Cost Provider Card (MID) */}
                <div className="bg-gradient-to-br from-indigo-950/20 to-slate-900/50 backdrop-blur-md border border-indigo-500/15 rounded-2xl p-5 shadow-xl relative overflow-hidden group hover:border-indigo-500/35 transition-all duration-300">
                  <div className="absolute top-3 right-3 text-indigo-400/20 font-extrabold text-3xl font-mono">MID</div>
                  <span className="text-indigo-400 text-xs font-bold uppercase tracking-wider">중간 월비용 (혼합)</span>
                  <h3 className="text-xl font-bold text-white mt-1">{midProv.provider}</h3>
                  <p className="text-slate-400 text-xs">
                    최상위 {midProv.highRatio}% / 가성비 {midProv.midRatio}%
                  </p>
                  <div className="mt-4">
                    <div className="text-2xl font-black text-indigo-400">
                      {formatCurrency(midProv.usdCost, 'USD')}<span className="text-xs font-semibold text-slate-400 ml-1">/월</span>
                    </div>
                    <div className="text-sm text-slate-400 mt-0.5 font-medium">
                      ({formatCurrency(midProv.krwCost, 'KRW')} /월)
                    </div>
                  </div>
                </div>

                {/* 3. Most Expensive Provider Card (MAX) */}
                <div className="bg-gradient-to-br from-rose-950/10 to-slate-900/50 backdrop-blur-md border border-rose-500/15 rounded-2xl p-5 shadow-xl relative overflow-hidden group hover:border-rose-500/35 transition-all duration-300">
                  <div className="absolute top-3 right-3 text-rose-500/15 font-extrabold text-3xl font-mono">MAX</div>
                  <span className="text-rose-400 text-xs font-bold uppercase tracking-wider">최대 월비용 (혼합)</span>
                  <h3 className="text-xl font-bold text-white mt-1">{maxProv.provider}</h3>
                  <p className="text-slate-400 text-xs">
                    최상위 {maxProv.highRatio}% / 가성비 {maxProv.midRatio}%
                  </p>
                  <div className="mt-4">
                    <div className="text-2xl font-black text-rose-400">
                      {formatCurrency(maxProv.usdCost, 'USD')}<span className="text-xs font-semibold text-slate-400 ml-1">/월</span>
                    </div>
                    <div className="text-sm text-slate-400 mt-0.5 font-medium">
                      ({formatCurrency(maxProv.krwCost, 'KRW')} /월)
                    </div>
                  </div>
                </div>

                {/* Cost Saving Metric Card (Full width inside its row) */}
                <div className="md:col-span-3 bg-gradient-to-r from-indigo-950/20 via-slate-900/40 to-indigo-950/15 backdrop-blur-md border border-indigo-500/15 rounded-2xl p-5 shadow-xl flex items-center justify-between gap-6 relative overflow-hidden">
                  <div className="absolute -left-12 -bottom-12 w-28 h-28 bg-indigo-500/5 blur-2xl rounded-full"></div>
                  <div>
                    <span className="text-indigo-400 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5" />
                      AI 서비스 공급자 요금 최대 차이
                    </span>
                    <p className="text-slate-300 text-sm mt-1 max-w-md">
                      가장 요금이 높은 서비스 - 가장 요금이 낮은 서비스
                    </p>
                  </div>
                  <div className="text-right z-10">
                    <div className="text-2xl font-black text-indigo-300">
                      {formatCurrency(summary.providerDifferenceUsd, 'USD')}
                    </div>
                    <div className="text-sm text-slate-400 mt-0.5 font-bold">
                      {formatCurrency(summary.providerDifferenceKrw, 'KRW')} / 월
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 3. Visualizations Chart */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-indigo-400" />
                  <span>예상 월간 비용 시각화 차트</span>
                </h2>
                <p className="text-[11px] text-slate-400">
                  {chartMode === 'blended' ? '사용자 모델 비율 믹스가 적용된 최종 비용' : '모델별 단독 운영 예상 비용'}
                </p>
              </div>

              {/* Double Toggles: Mode (Mixed/Individual) & Currency */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Mode toggle */}
                <div className="inline-flex bg-slate-950 p-1 rounded-xl border border-slate-800/85">
                  <button
                    onClick={() => setChartMode('blended')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${chartMode === 'blended' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    혼합 요금 (3사)
                  </button>
                  <button
                    onClick={() => setChartMode('individual')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${chartMode === 'individual' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    개별 모델 (6종)
                  </button>
                </div>

                {/* Currency toggle */}
                <div className="inline-flex bg-slate-950 p-1 rounded-xl border border-slate-800/85">
                  <button
                    onClick={() => setCurrencyMode('KRW')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${currencyMode === 'KRW' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    ₩
                  </button>
                  <button
                    onClick={() => setCurrencyMode('USD')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${currencyMode === 'USD' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    $
                  </button>
                </div>
              </div>
            </div>

            {/* Recharts Bar Chart */}
            <div className="h-72 w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 20, right: 10, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.4} vertical={false} />
                  <XAxis
                    dataKey="name"
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    hide={true}
                  />
                  <Tooltip content={<CostTooltip chartMode={chartMode} formatNumber={formatNumber} />} cursor={{ fill: '#334155', opacity: 0.15 }} />
                  <Bar
                    dataKey="cost"
                    radius={[8, 8, 0, 0]}
                    maxBarSize={45}
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getProviderColor(entry.provider)} />
                    ))}
                    <LabelList
                      dataKey="cost"
                      position="top"
                      formatter={(v: ChartValue) => {
                        const value = toFiniteNumber(v);
                        if (currencyMode === 'USD') {
                          return `$${formatNumber(value, 0)}`;
                        }
                        return `₩${formatNumber(value)}`;
                      }}
                      fill="#94a3b8"
                      fontSize={10}
                      fontWeight="bold"
                      offset={8}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            
            {/* Chart Legend */}
            <div className="flex flex-wrap justify-center gap-6 mt-3 border-t border-slate-800/50 pt-4 text-xs text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-[#4285f4]"></span>
                <span>Google</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-[#10a37f]"></span>
                <span>OpenAI</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-[#f37022]"></span>
                <span>Anthropic</span>
              </div>
            </div>
          </div>

          {/* User Tier Token Usage Specs Card (Added & Editable - In k Units - Moved here) */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl">
            <h2 className="text-sm font-bold text-slate-200 mb-2 flex items-center gap-2">
              <Info className="w-4 h-4 text-indigo-400" />
              <span>유저 유형별 월간 토큰 사용량 설정 (k)</span>
            </h2>
            <p className="text-slate-400 text-[10px] mb-4">
              각 유저 유형이 한 달 동안 소모하는 평균 토큰 수(k 단위, 1k = 1,000)를 수동 조절하여 연산에 반영합니다.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Light User */}
              {/* Light User */}
              <div className="flex flex-col gap-2 p-3 bg-slate-950/40 border border-slate-800/50 rounded-xl hover:border-indigo-500/10 transition-all duration-200">
                <span className="font-semibold text-emerald-400">일반 유저 (Light User)</span>
                <div className="flex flex-col gap-1.5 text-[10px]">
                  <div>
                    <label className="block text-slate-500 mb-0.5 font-medium">Input 토큰 수 (k)</label>
                    <input
                      type="text"
                      value={tokenInputCache['light-inputTokens'] || ''}
                      onChange={(e) => handleTokenInputChange('light', 'inputTokens', e.target.value)}
                      onBlur={() => handleTokenInputBlur('light', 'inputTokens')}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-100 font-bold font-mono text-lg text-right focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-0.5 font-medium">Output 토큰 수 (k)</label>
                    <input
                      type="text"
                      value={tokenInputCache['light-outputTokens'] || ''}
                      onChange={(e) => handleTokenInputChange('light', 'outputTokens', e.target.value)}
                      onBlur={() => handleTokenInputBlur('light', 'outputTokens')}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-100 font-bold font-mono text-lg text-right focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Heavy User */}
              <div className="flex flex-col gap-2 p-3 bg-slate-950/40 border border-slate-800/50 rounded-xl hover:border-indigo-500/10 transition-all duration-200">
                <span className="font-semibold text-amber-400">헤비 유저 (Heavy User)</span>
                <div className="flex flex-col gap-1.5 text-[10px]">
                  <div>
                    <label className="block text-slate-500 mb-0.5 font-medium">Input 토큰 수 (k)</label>
                    <input
                      type="text"
                      value={tokenInputCache['heavy-inputTokens'] || ''}
                      onChange={(e) => handleTokenInputChange('heavy', 'inputTokens', e.target.value)}
                      onBlur={() => handleTokenInputBlur('heavy', 'inputTokens')}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-100 font-bold font-mono text-lg text-right focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-0.5 font-medium">Output 토큰 수 (k)</label>
                    <input
                      type="text"
                      value={tokenInputCache['heavy-outputTokens'] || ''}
                      onChange={(e) => handleTokenInputChange('heavy', 'outputTokens', e.target.value)}
                      onBlur={() => handleTokenInputBlur('heavy', 'outputTokens')}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-100 font-bold font-mono text-lg text-right focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Standard Dev */}
              <div className="flex flex-col gap-2 p-3 bg-slate-950/40 border border-slate-800/50 rounded-xl hover:border-indigo-500/10 transition-all duration-200">
                <span className="font-semibold text-blue-400">일반 개발자 (Standard Dev)</span>
                <div className="flex flex-col gap-1.5 text-[10px]">
                  <div>
                    <label className="block text-slate-500 mb-0.5 font-medium">Input 토큰 수 (k)</label>
                    <input
                      type="text"
                      value={tokenInputCache['stdDev-inputTokens'] || ''}
                      onChange={(e) => handleTokenInputChange('stdDev', 'inputTokens', e.target.value)}
                      onBlur={() => handleTokenInputBlur('stdDev', 'inputTokens')}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-100 font-bold font-mono text-lg text-right focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-0.5 font-medium">Output 토큰 수 (k)</label>
                    <input
                      type="text"
                      value={tokenInputCache['stdDev-outputTokens'] || ''}
                      onChange={(e) => handleTokenInputChange('stdDev', 'outputTokens', e.target.value)}
                      onBlur={() => handleTokenInputBlur('stdDev', 'outputTokens')}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-100 font-bold font-mono text-lg text-right focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Heavy Dev */}
              <div className="flex flex-col gap-2 p-3 bg-slate-950/40 border border-slate-800/50 rounded-xl hover:border-indigo-500/10 transition-all duration-200">
                <span className="font-semibold text-purple-400">헤비 개발자 (Heavy Dev)</span>
                <div className="flex flex-col gap-1.5 text-[10px]">
                  <div>
                    <label className="block text-slate-500 mb-0.5 font-medium">Input 토큰 수 (k)</label>
                    <input
                      type="text"
                      value={tokenInputCache['heavyDev-inputTokens'] || ''}
                      onChange={(e) => handleTokenInputChange('heavyDev', 'inputTokens', e.target.value)}
                      onBlur={() => handleTokenInputBlur('heavyDev', 'inputTokens')}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-100 font-bold font-mono text-lg text-right focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-0.5 font-medium">Output 토큰 수 (k)</label>
                    <input
                      type="text"
                      value={tokenInputCache['heavyDev-outputTokens'] || ''}
                      onChange={(e) => handleTokenInputChange('heavyDev', 'outputTokens', e.target.value)}
                      onBlur={() => handleTokenInputBlur('heavyDev', 'outputTokens')}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-100 font-bold font-mono text-lg text-right focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 4. Full Blended Provider Table (Added) */}
      <section className="max-w-7xl mx-auto mt-8 bg-slate-900/40 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl overflow-hidden">
        <h2 className="text-lg font-bold text-slate-200 mb-5 flex items-center gap-2">
          <GitCompare className="w-5 h-5 text-indigo-400" />
          <span>서비스 제공사별 혼합 요금 요약 시트</span>
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                <th className="py-3.5 px-4">AI 서비스</th>
                <th className="py-3.5 px-4">최상위 모델 (비율)</th>
                <th className="py-3.5 px-4">가성비 모델 (비율)</th>
                <th className="py-3.5 px-4 text-right">예상 혼합 월 비용 (USD)</th>
                <th className="py-3.5 px-4 text-right text-indigo-300 font-semibold">예상 혼합 월 비용 (KRW)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {[...providerResults]
                .sort((a, b) => {
                  const order: Record<string, number> = { Google: 0, OpenAI: 1, Anthropic: 2 };
                  return (order[a.provider] ?? 9) - (order[b.provider] ?? 9);
                })
                .map((prov, index) => (
                  <tr key={index} className="hover:bg-slate-800/20 transition-colors">
                    <td className="py-4 px-4 font-bold">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-md border text-xs font-bold ${getProviderBgColor(prov.provider)}`}>
                        {prov.provider}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-slate-300">
                      <span className="font-semibold text-white">{getModelNameByTier(prov.provider, 'high')}</span>
                      <span className="text-xs text-indigo-400 ml-2 font-mono font-bold">({prov.highRatio}%)</span>
                    </td>
                    <td className="py-4 px-4 text-slate-300">
                      <span className="font-semibold text-white">{getModelNameByTier(prov.provider, 'mid')}</span>
                      <span className="text-xs text-emerald-400 ml-2 font-mono font-bold">({prov.midRatio}%)</span>
                    </td>
                    <td className="py-4 px-4 text-right font-mono font-bold text-white">
                      ${formatNumber(prov.usdCost, 0)}
                    </td>
                    <td className="py-4 px-4 text-right font-mono font-extrabold text-indigo-300 bg-indigo-500/5">
                      ₩{formatNumber(prov.krwCost, 0)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5. Full Pricing Details Table */}
      <section className="max-w-7xl mx-auto mt-8 bg-slate-900/40 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl overflow-hidden">
        <h2 className="text-lg font-bold text-slate-200 mb-5 flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-400" />
          <span>개별 모델 상세 요금 일람</span>
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                <th className="py-3.5 px-4">AI 서비스</th>
                <th className="py-3.5 px-4">모델명</th>
                <th className="py-3.5 px-4">구분</th>
                <th className="py-3.5 px-4 text-right">1M Token 단가 (Input / Output)</th>
                <th className="py-3.5 px-4 text-right">예상 월 비용 (USD)</th>
                <th className="py-3.5 px-4 text-right text-indigo-300 font-semibold">예상 월 비용 (KRW)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {[...results]
                .sort((a, b) => {
                  const order: Record<string, number> = { Google: 0, OpenAI: 1, Anthropic: 2 };
                  if (a.provider !== b.provider) {
                    return (order[a.provider] ?? 9) - (order[b.provider] ?? 9);
                  }
                  return a.tier === 'high' ? -1 : 1;
                })
                .map((model, index) => {
                  const provider = isProviderName(model.provider) ? model.provider : undefined;
                  const tier = model.tier as ModelTier;
                  const modelOptions = provider ? getModelOptions(provider, tier) : [];

                  return (
                    <tr key={`${model.provider}-${model.tier}-${model.modelName}-${index}`} className="hover:bg-slate-800/20 transition-colors">
                      <td className="py-4 px-4 font-bold">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-md border text-xs font-bold ${getProviderBgColor(model.provider)}`}>
                          {model.provider}
                        </span>
                      </td>
                      <td className="py-4 px-4 font-semibold text-white">
                        {provider && modelOptions.length > 1 ? (
                          <select
                            value={model.modelName}
                            onChange={(event) => handleSelectedModelChange(provider, tier, event.target.value)}
                            className="w-full max-w-[220px] bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-200 font-bold font-mono focus:outline-none focus:border-indigo-500 text-xs cursor-pointer hover:border-slate-600 transition-colors"
                          >
                            {modelOptions.map(option => (
                              <option key={option.modelName} value={option.modelName}>
                                {option.modelName}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="font-mono text-xs text-slate-300 font-semibold">{model.modelName}</span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        {model.tier === 'high' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full border border-violet-500/20">
                            최상위 모델
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            가성비 모델
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-slate-300">
                        ${formatNumber(model.inputCostPer1M, 3)} / ${formatNumber(model.outputCostPer1M, 3)}
                      </td>
                      <td className="py-4 px-4 text-right font-mono font-bold text-white">
                        ${formatNumber(model.usdCost, 0)}
                      </td>
                      <td className="py-4 px-4 text-right font-mono font-extrabold text-indigo-300 bg-indigo-500/5">
                        ₩{formatNumber(model.krwCost, 0)}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4.5. Active Model Performance Comparison Table */}
      <section className="max-w-7xl mx-auto mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* High-tier Performance Table */}
        <div className="bg-slate-900/30 backdrop-blur-md border border-slate-800/80 rounded-2xl p-5 shadow-xl overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                <span>최상위(High-tier) 모델 성능 비교</span>
              </h2>
              <span className="text-[9px] text-violet-300 font-bold bg-violet-500/10 px-1.5 py-0.5 rounded border border-violet-500/20 font-mono">
                High-tier Leaderboard
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-950/40">
                    <th className="py-2 px-3">회사</th>
                    <th className="py-2 px-3">모델명</th>
                    <th className="py-2 px-3 text-center">컨텍스트</th>
                    <th className="py-2 px-3 text-center">출력 한도</th>
                    <th className="py-2 px-3 text-center text-violet-300 font-bold">MMLU-Pro</th>
                    <th className="py-2 px-3 text-center text-cyan-300 font-bold">SWE-bench Pro</th>
                    <th className="py-2 px-3 text-right">토큰 요금 (입/출)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {[...results]
                    .filter(m => m.tier === 'high')
                    .sort((a, b) => getValsIndexVal(b.modelName, performanceDb) - getValsIndexVal(a.modelName, performanceDb))
                    .map((model, index) => {
                       const spec = performanceDb[model.modelName] || { context: '-', maxOutput: '-', valsIndex: '-', sweBench: '-' };
                       return (
                        <tr key={index} className="hover:bg-slate-800/10 transition-colors">
                          <td className="py-2.5 px-3 font-bold">
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] ${getProviderBgColor(model.provider)}`}>
                              {model.provider}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-white">{model.modelName}</td>
                          <td className="py-2.5 px-3 text-center font-mono text-slate-300">{spec.context}</td>
                          <td className="py-2.5 px-3 text-center font-mono text-slate-300">{spec.maxOutput}</td>
                          <td className="py-2.5 px-3 text-center font-mono font-extrabold text-violet-300 bg-violet-500/5">{spec.valsIndex}</td>
                          <td className="py-2.5 px-3 text-center font-mono font-extrabold text-cyan-300 bg-cyan-500/5">{spec.sweBench}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-[10px] text-slate-300">
                            ${model.inputCostPer1M.toFixed(model.inputCostPer1M < 0.1 ? 3 : 2)} / ${model.outputCostPer1M.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            {/* 세부 특징 특징점 요약 피드 */}
            <div className="mt-3.5 space-y-2 border-t border-slate-800/60 pt-3">
              {[...results]
                .filter(m => m.tier === 'high')
                .sort((a, b) => getValsIndexVal(b.modelName, performanceDb) - getValsIndexVal(a.modelName, performanceDb))
                .map((model, index) => {
                  const spec = performanceDb[model.modelName] || { features: '' };
                  return (
                    <div key={index} className="text-[10px] text-slate-400 flex items-start gap-1.5">
                      <span className="text-[9px] font-bold text-slate-500 bg-slate-950 px-1 py-0.5 rounded border border-slate-800 shrink-0 font-mono w-[65px] text-center">{model.provider}</span>
                      <span>{spec.features}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Mid-tier Performance Table */}
        <div className="bg-slate-900/30 backdrop-blur-md border border-slate-800/80 rounded-2xl p-5 shadow-xl overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>가성비(Mid-tier) 모델 성능 비교</span>
              </h2>
              <span className="text-[9px] text-emerald-300 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 font-mono">
                Mid-tier Leaderboard
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-950/40">
                    <th className="py-2 px-3">회사</th>
                    <th className="py-2 px-3">모델명</th>
                    <th className="py-2 px-3 text-center">컨텍스트</th>
                    <th className="py-2 px-3 text-center">출력 한도</th>
                    <th className="py-2 px-3 text-center text-emerald-300 font-bold">MMLU-Pro</th>
                    <th className="py-2 px-3 text-center text-cyan-300 font-bold">SWE-bench Pro</th>
                    <th className="py-2 px-3 text-right">토큰 요금 (입/출)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {[...results]
                    .filter(m => m.tier === 'mid')
                    .sort((a, b) => getValsIndexVal(b.modelName, performanceDb) - getValsIndexVal(a.modelName, performanceDb))
                    .map((model, index) => {
                       const spec = performanceDb[model.modelName] || { context: '-', maxOutput: '-', valsIndex: '-', sweBench: '-' };
                       return (
                        <tr key={index} className="hover:bg-slate-800/10 transition-colors">
                          <td className="py-2.5 px-3 font-bold">
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] ${getProviderBgColor(model.provider)}`}>
                              {model.provider}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-white">{model.modelName}</td>
                          <td className="py-2.5 px-3 text-center font-mono text-slate-300">{spec.context}</td>
                          <td className="py-2.5 px-3 text-center font-mono text-slate-300">{spec.maxOutput}</td>
                          <td className="py-2.5 px-3 text-center font-mono font-extrabold text-emerald-300 bg-emerald-500/5">{spec.valsIndex}</td>
                          <td className="py-2.5 px-3 text-center font-mono font-extrabold text-cyan-300 bg-cyan-500/5">{spec.sweBench}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-[10px] text-slate-300">
                            ${model.inputCostPer1M.toFixed(model.inputCostPer1M < 0.1 ? 3 : 2)} / ${model.outputCostPer1M.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            {/* 세부 특징 특징점 요약 피드 */}
            <div className="mt-3.5 space-y-2 border-t border-slate-800/60 pt-3">
              {[...results]
                .filter(m => m.tier === 'mid')
                .sort((a, b) => getValsIndexVal(b.modelName, performanceDb) - getValsIndexVal(a.modelName, performanceDb))
                .map((model, index) => {
                  const spec = performanceDb[model.modelName] || { features: '' };
                  return (
                    <div key={index} className="text-[10px] text-slate-400 flex items-start gap-1.5">
                      <span className="text-[9px] font-bold text-slate-500 bg-slate-950 px-1 py-0.5 rounded border border-slate-800 shrink-0 font-mono w-[65px] text-center">{model.provider}</span>
                      <span>{spec.features}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {/* MMLU-Pro & SWE-bench Pro Description Footer Note */}
        <div className="col-span-1 lg:col-span-2 text-[10px] text-slate-400 bg-slate-950/40 border border-slate-800/80 p-3.5 rounded-xl leading-relaxed flex items-start gap-2.5 shadow-md">
          <Info className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <div>
              <span className="font-bold text-slate-200">MMLU-Pro 벤치마크란?</span>
              <p className="mt-0.5 text-slate-400">
                대학 학부생 수준의 다학제적 객관식 지식 평가(MMLU) 지표에 고난이도 추론, 다단계 수학적 문제 해결 능력을 결합하여 변별력을 극대화한 종합 인공지능 지능 평가 기준입니다. 위의 스펙 표들은 MMLU-Pro 득점 백분율(%) 지수가 높은 순서대로 실시간 자동 배열됩니다.
              </p>
            </div>
            <div>
              <span className="font-bold text-slate-200">SWE-bench Pro 벤치마크란?</span>
              <p className="mt-0.5 text-slate-400">
                실제 깃허브(GitHub) 소프트웨어 저장소의 복잡한 버그/기능 요구사항 이슈를 인공지능 에이전트가 직접 소스 코드 분석, 수정, 빌드하여 테스트 코드 통과 여부까지 완벽히 검증받는 수행 능력 평가지표입니다. 실무 코딩 에이전트 성능을 가늠하는 가장 가혹하고 변별력 높은 최고난도 벤치마크 기준입니다.
              </p>
            </div>
          </div>
        </div>

      </section>

      {/* 5.5. AI Model Pricing Trend Analysis (Added: Dual 2-Column charts for Flagship & Budget) */}
      <section className="max-w-7xl mx-auto mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Flagship (High-tier) Chart */}
        <div className="bg-slate-900/30 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-2">
              <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-indigo-400" />
                <span>최상위(High-tier) 모델 최근 3개월 가격 추이</span>
              </h2>
              <span className="text-[9px] text-indigo-300 font-bold bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 font-mono">
                USD / 1M Input
              </span>
            </div>
            <p className="text-slate-400 text-[11px] mb-4">
              최근 3개월 동안 7일 단위로 표시하는 주요 3사 최상위 플래그십 단가 변동 흐름
            </p>
          </div>
          
          <div className="h-64 w-full bg-slate-950/20 border border-slate-800/40 rounded-xl p-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={selectedFlagshipHistoryData}
                margin={{ top: 10, right: 15, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.4} />
                <XAxis 
                  dataKey="week" 
                  stroke="#64748b" 
                  fontSize={10}
                  tickLine={false}
                />
                <YAxis 
                  stroke="#64748b" 
                  fontSize={10}
                  tickFormatter={(value) => `$${value}`}
                  domain={[0, flagshipYAxisMax]}
                  tickLine={false}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#0f172a', 
                    borderColor: '#1e293b',
                    borderRadius: '12px',
                    color: '#fff',
                    fontSize: '11px',
                    fontFamily: 'monospace'
                  }}
                  formatter={(value: ChartValue) => formatDollarTooltip(value, 2)}
                />
                <Legend content={() => renderPriceSortedLegend(highTrendLines)} />
                {highTrendLines.map(line => (
                  <Line
                    key={`high-${line.provider}`}
                    type="monotone"
                    dataKey={line.provider}
                    name={`${line.modelName} ($${line.latestPrice.toFixed(2)})`}
                    stroke={line.color}
                    strokeWidth={2.5}
                    dot={{ r: 3, strokeWidth: 1.5 }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Budget (Mid-tier) Chart */}
        <div className="bg-slate-900/30 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-2">
              <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-emerald-400" />
                <span>가성비(Mid-tier) 모델 최근 3개월 가격 추이</span>
              </h2>
              <span className="text-[9px] text-emerald-300 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 font-mono">
                USD / 1M Input
              </span>
            </div>
            <p className="text-slate-400 text-[11px] mb-4">
              최근 3개월 동안 7일 단위로 표시하는 주요 3사 가성비 엔트리 단가 변동 흐름
            </p>
          </div>

          <div className="h-64 w-full bg-slate-950/20 border border-slate-800/40 rounded-xl p-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={selectedBudgetHistoryData}
                margin={{ top: 10, right: 15, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.4} />
                <XAxis 
                  dataKey="week" 
                  stroke="#64748b" 
                  fontSize={10}
                  tickLine={false}
                />
                <YAxis 
                  stroke="#64748b" 
                  fontSize={10}
                  tickFormatter={(value) => `$${value}`}
                  domain={[0, budgetYAxisMax]}
                  tickLine={false}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#0f172a', 
                    borderColor: '#1e293b',
                    borderRadius: '12px',
                    color: '#fff',
                    fontSize: '11px',
                    fontFamily: 'monospace'
                  }}
                  formatter={(value: ChartValue) => formatDollarTooltip(value, 3)}
                />
                <Legend content={() => renderPriceSortedLegend(midTrendLines)} />
                {midTrendLines.map(line => (
                  <Line
                    key={`mid-${line.provider}`}
                    type="monotone"
                    dataKey={line.provider}
                    name={`${line.modelName} ($${line.latestPrice.toFixed(2)})`}
                    stroke={line.color}
                    strokeWidth={2.5}
                    dot={{ r: 3, strokeWidth: 1.5 }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </section>

      {/* 6. AI Model Pricing History & Trend Analysis (Added) */}
      <section className="max-w-7xl mx-auto mt-8 bg-slate-900/30 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl overflow-hidden">
        <h2 className="text-lg font-bold text-slate-200 mb-5 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-indigo-400" />
          <span>신규모델출시, 단가 변동 추세</span>
        </h2>
        
        <p className="text-slate-400 text-xs mb-6 leading-relaxed">
          주요 AI 공급사의 신규 모델 출시, 일반 제공 전환, 가격 인하/인상 정보를 입수해 공급사별 최신순으로 보여줍니다. (최근 6개월 / 100만 토큰 기준)
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono text-xs">
          {/* OpenAI Trend */}
          <div className="p-4 bg-slate-950/40 border border-slate-800/40 rounded-xl space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              <span className="font-bold text-slate-200">OpenAI (GPT 시리즈)</span>
            </div>
            <div className="space-y-3">
              {newsEvents.OpenAI.map((item, idx) => (
                <div key={idx} className="flex flex-col gap-1">
                  <span className={`text-[10px] font-semibold ${idx === 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {item.date} {idx === 0 && '(최근)'}
                  </span>
                  <span className="text-slate-300 font-bold">
                    {item.headline}
                  </span>
                  <p className="text-[10px] text-slate-500 leading-normal">{item.content}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Anthropic Trend */}
          <div className="p-4 bg-slate-950/40 border border-slate-800/40 rounded-xl space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <div className="w-2 h-2 rounded-full bg-amber-500"></div>
              <span className="font-bold text-slate-200">Anthropic (Claude 시리즈)</span>
            </div>
            <div className="space-y-3">
              {newsEvents.Anthropic.map((item, idx) => (
                <div key={idx} className="flex flex-col gap-1">
                  <span className={`text-[10px] font-semibold ${idx === 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                    {item.date} {idx === 0 && '(최근)'}
                  </span>
                  <span className="text-slate-300 font-bold">
                    {item.headline}
                  </span>
                  <p className="text-[10px] text-slate-500 leading-normal">{item.content}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Google Trend */}
          <div className="p-4 bg-slate-950/40 border border-slate-800/40 rounded-xl space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <span className="font-bold text-slate-200">Google (Gemini 시리즈)</span>
            </div>
            <div className="space-y-3">
              {newsEvents.Google.map((item, idx) => (
                <div key={idx} className="flex flex-col gap-1">
                  <span className={`text-[10px] font-semibold ${idx === 0 ? 'text-blue-400' : 'text-slate-500'}`}>
                    {item.date} {idx === 0 && '(최근)'}
                  </span>
                  <span className="text-slate-300 font-bold">
                    {item.headline}
                  </span>
                  <p className="text-[10px] text-slate-500 leading-normal">{item.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer Info / Technical Assumptions */}
      <footer className="max-w-7xl mx-auto mt-12 text-slate-500 text-xs flex flex-col sm:flex-row sm:justify-between items-center gap-4 border-t border-slate-800/40 pt-6">
        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-6">
          <span className="font-semibold text-slate-400">Made by JP</span>
          <span className="hidden sm:inline w-1 h-1 bg-slate-800 rounded-full"></span>
          <p>© 2026 AI Cost Simulation Agent System. All rights reserved.</p>
        </div>
        <p className="max-w-md sm:text-right text-[10px] text-slate-600">
          본 시뮬레이션은 월간 평균 사용량 패턴(일반 {formatNumber(DEFAULT_TOKEN_USAGE.light.inputTokens)}/헤비 {formatNumber(DEFAULT_TOKEN_USAGE.heavy.inputTokens)}/개발 {formatNumber(DEFAULT_TOKEN_USAGE.stdDev.inputTokens)}/헤비개발 {formatNumber(DEFAULT_TOKEN_USAGE.heavyDev.inputTokens)} 토큰 등)을 토대로 산출된 계산입니다.
        </p>
      </footer>
    </div>
  );
}
