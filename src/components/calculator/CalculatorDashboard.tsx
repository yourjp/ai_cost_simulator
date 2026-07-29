'use client';

import React, { useState, useEffect } from 'react';
import { UIStateAgent, UserRatioState, UserType, ProviderMixState, ModelMixRatio } from './UIStateAgent';
import { PricingDataAgent, ModelPricing, FALLBACK_PRICING } from './PricingDataAgent';
import { SimulationEngineAgent, DEFAULT_TOKEN_USAGE, UserTokenUsage } from './SimulationEngineAgent';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { Users, DollarSign, RefreshCw, Layers, Award, Sparkles, TrendingUp, Info, GitCompare } from 'lucide-react';

export default function CalculatorDashboard() {
  const [mounted, setMounted] = useState(false);
  const [totalUsers, setTotalUsers] = useState<number>(1000);
  const [exchangeRate, setExchangeRate] = useState<number>(1500);
  const [currencyMode, setCurrencyMode] = useState<'USD' | 'KRW'>('USD');
  const [chartMode, setChartMode] = useState<'individual' | 'blended'>('blended');

  // ratios & history states for UI-State-Agent (user cohorts)
  const [ratios, setRatios] = useState<UserRatioState>({
    light: 50,
    heavy: 20,
    stdDev: 20,
    heavyDev: 10,
  });
  const [history, setHistory] = useState<UserType[]>(['light', 'heavy', 'stdDev', 'heavyDev']);

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
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Anthropic selected high-tier model choice ('Claude 4.8 Opus' vs 'Claude Fable 5')
  const [selectedAnthropicHighModelName, setSelectedAnthropicHighModelName] = useState<string>('Claude 4.8 Opus');

  // Filter pricingData to only include the active Anthropic high-tier model selected by the user
  const filteredPricingData = pricingData.filter(model => {
    if (model.provider === 'Anthropic' && model.tier === 'high') {
      return model.modelName === selectedAnthropicHighModelName;
    }
    return true;
  });

  // Dynamic user token usages state
  const [tokenUsage, setTokenUsage] = useState<Record<UserType, UserTokenUsage>>(DEFAULT_TOKEN_USAGE);

  // Initialize and Fetch price constants / API simulation
  useEffect(() => {
    setMounted(true);
    const agent = new PricingDataAgent();
    setLoading(true);
    agent.fetchPricingData()
      .then((data) => {
        setPricingData(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setFetchError('단가 데이터를 실시간 로드하는 중 에러가 발생하여 안전한 Fallback 단가 상수를 사용합니다.');
        setPricingData(agent.getPricingData());
        setLoading(false);
      });
  }, []);

  const handleRatioChange = (type: UserType, value: number) => {
    const agent = new UIStateAgent(history);
    const { newRatios, newHistory } = agent.adjustRatios(ratios, type, value);
    setRatios(newRatios);
    setHistory(newHistory);
  };

  const handleCountChange = (type: UserType, value: number) => {
    const boundedCount = Math.max(0, Math.min(totalUsers, value));
    const targetPercent = totalUsers > 0 ? (boundedCount / totalUsers) * 100 : 0;
    
    const agent = new UIStateAgent(history);
    const { newRatios, newHistory } = agent.adjustRatios(ratios, type, targetPercent);
    setRatios(newRatios);
    setHistory(newHistory);
  };

  const handleTokenUsageChange = (type: UserType, field: 'inputTokens' | 'outputTokens', value: number) => {
    setTokenUsage({
      ...tokenUsage,
      [type]: {
        ...tokenUsage[type],
        [field]: Math.max(0, value)
      }
    });
  };

  const formatComma = (num: number) => {
    if (num === undefined || num === null || isNaN(num)) return '';
    return new Intl.NumberFormat().format(num);
  };

  const parseComma = (str: string) => {
    const cleanStr = str.replace(/,/g, '');
    return parseInt(cleanStr, 10) || 0;
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

  const handleForceFetch = () => {
    const agent = new PricingDataAgent();
    setLoading(true);
    setFetchError(null);
    agent.fetchPricingData()
      .then((data) => {
        setPricingData(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setFetchError('외부 연결 오류로 로컬 백업 단가 데이터를 유지합니다.');
        setLoading(false);
      });
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

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#070a13] text-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="animate-spin text-indigo-500 w-10 h-10" />
          <p className="text-slate-400 font-medium">시뮬레이션 엔진 로딩 중...</p>
        </div>
      </div>
    );
  }

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

  // Recharts custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
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
  };

  return (
    <div className="min-h-screen bg-[#070a13] bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-950/20 via-[#070a13] to-[#070a13] text-slate-100 p-6 md:p-10 font-sans">
      
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
            <span>최근 업데이트: 2026-07-29</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleForceFetch}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700/80 active:bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-sm transition-all duration-200 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>단가 갱신</span>
            </button>
            <div className="text-right hidden sm:block">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Pricing-Data-Agent Online
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Layout Grid */}
      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Left Side: Inputs & UI-State-Agent Controls (5 cols) */}
        <section className="lg:col-span-5 flex flex-col gap-6">
          
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

            <p className="text-slate-400 text-xs mb-6 leading-relaxed">
              임의의 3가지 값을 조작하면, UI-State-Agent가 나머지 1가지 비율을 최적화하여 자동으로 총합 100%를 보정합니다.
            </p>

            {/* Proportions Sliders */}
            <div className="space-y-6">
              {/* 1. Light User */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-200">일반 유저 (Light User)</span>
                    <span className="text-[10px] text-slate-400">월 Input 30만 / Output 7.5만 토큰</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={formatComma(Math.round(totalUsers * (ratios.light / 100)))}
                      onChange={(e) => handleCountChange('light', parseComma(e.target.value))}
                      className="w-20 px-1.5 py-0.5 text-right bg-slate-950 border border-slate-800 rounded text-slate-300 font-semibold font-mono text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <span className="text-slate-400 text-sm font-semibold">명</span>
                    <span className="text-emerald-400 text-xs font-bold font-mono ml-1">
                      ({ratios.light}%)
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="0.1"
                  value={ratios.light}
                  onChange={(e) => handleRatioChange('light', parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 bg-slate-950 rounded-lg cursor-pointer h-1.5"
                />
              </div>

              {/* 2. Heavy User */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-200">헤비 유저 (Heavy User)</span>
                    <span className="text-[10px] text-slate-400">월 Input 150만 / Output 40만 토큰</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={formatComma(Math.round(totalUsers * (ratios.heavy / 100)))}
                      onChange={(e) => handleCountChange('heavy', parseComma(e.target.value))}
                      className="w-20 px-1.5 py-0.5 text-right bg-slate-950 border border-slate-800 rounded text-slate-300 font-semibold font-mono text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <span className="text-slate-400 text-sm font-semibold">명</span>
                    <span className="text-amber-400 text-xs font-bold font-mono ml-1">
                      ({ratios.heavy}%)
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="0.1"
                  value={ratios.heavy}
                  onChange={(e) => handleRatioChange('heavy', parseFloat(e.target.value))}
                  className="w-full accent-amber-500 bg-slate-950 rounded-lg cursor-pointer h-1.5"
                />
              </div>

              {/* 3. Standard Developer */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-200">일반 개발자 (Standard Dev)</span>
                    <span className="text-[10px] text-slate-400">월 Input 500만 / Output 100만 토큰</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={formatComma(Math.round(totalUsers * (ratios.stdDev / 100)))}
                      onChange={(e) => handleCountChange('stdDev', parseComma(e.target.value))}
                      className="w-20 px-1.5 py-0.5 text-right bg-slate-950 border border-slate-800 rounded text-slate-300 font-semibold font-mono text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <span className="text-slate-400 text-sm font-semibold">명</span>
                    <span className="text-blue-400 text-xs font-bold font-mono ml-1">
                      ({ratios.stdDev}%)
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="0.1"
                  value={ratios.stdDev}
                  onChange={(e) => handleRatioChange('stdDev', parseFloat(e.target.value))}
                  className="w-full accent-blue-500 bg-slate-950 rounded-lg cursor-pointer h-1.5"
                />
              </div>

              {/* 4. Heavy Developer */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-200">헤비 개발자 (Heavy Dev)</span>
                    <span className="text-[10px] text-slate-400">월 Input 2000만 / Output 400만 토큰</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={formatComma(Math.round(totalUsers * (ratios.heavyDev / 100)))}
                      onChange={(e) => handleCountChange('heavyDev', parseComma(e.target.value))}
                      className="w-20 px-1.5 py-0.5 text-right bg-slate-950 border border-slate-800 rounded text-slate-300 font-semibold font-mono text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <span className="text-slate-400 text-sm font-semibold">명</span>
                    <span className="text-purple-400 text-xs font-bold font-mono ml-1">
                      ({ratios.heavyDev}%)
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="0.1"
                  value={ratios.heavyDev}
                  onChange={(e) => handleRatioChange('heavyDev', parseFloat(e.target.value))}
                  className="w-full accent-purple-500 bg-slate-950 rounded-lg cursor-pointer h-1.5"
                />
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
                <div className="text-[10px] text-slate-500 mb-3">
                  {getModelNameByTier('OpenAI', 'high')} vs {getModelNameByTier('OpenAI', 'mid')}
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

                {/* Claude High-tier model Select Box */}
                <div className="mb-2.5 flex items-center justify-between gap-2 bg-slate-900/60 border border-slate-800/40 px-2 py-1.5 rounded-lg text-xs">
                  <label htmlFor="claude-high-model" className="text-slate-400 font-semibold text-[10px] uppercase">최상위 모델 선택</label>
                  <select
                    id="claude-high-model"
                    value={selectedAnthropicHighModelName}
                    onChange={(e) => setSelectedAnthropicHighModelName(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded px-2 py-0.5 text-slate-200 font-bold font-mono focus:outline-none focus:border-indigo-500 text-[11px]"
                  >
                    <option value="Claude 4.8 Opus">Claude 4.8 Opus ($5/$25)</option>
                    <option value="Claude Fable 5">Claude Fable 5 ($10/$50)</option>
                  </select>
                </div>

                <div className="text-[10px] text-slate-500 mb-3">
                  {selectedAnthropicHighModelName} vs {getModelNameByTier('Anthropic', 'mid')}
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
                <div className="text-[10px] text-slate-500 mb-3">
                  {getModelNameByTier('Google', 'high')} vs {getModelNameByTier('Google', 'mid')}
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
        <section className="lg:col-span-7 flex flex-col gap-6">

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
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#334155', opacity: 0.15 }} />
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
                      formatter={(v: any) => {
                        if (currencyMode === 'USD') {
                          return `$${formatNumber(v, 0)}`;
                        }
                        return `₩${formatNumber(v)}`;
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
              <div className="flex flex-col gap-2 p-3 bg-slate-950/40 border border-slate-800/50 rounded-xl hover:border-indigo-500/10 transition-all duration-200">
                <span className="font-semibold text-emerald-400">일반 유저 (Light User)</span>
                <div className="flex flex-col gap-1.5 text-[10px]">
                  <div>
                    <label className="block text-slate-500 mb-0.5 font-medium">Input 토큰 수 (k)</label>
                    <input
                      type="text"
                      value={formatComma(tokenUsage.light.inputTokens / 1000)}
                      onChange={(e) => handleTokenUsageChange('light', 'inputTokens', parseComma(e.target.value) * 1000)}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-100 font-bold font-mono text-lg text-right focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-0.5 font-medium">Output 토큰 수 (k)</label>
                    <input
                      type="text"
                      value={formatComma(tokenUsage.light.outputTokens / 1000)}
                      onChange={(e) => handleTokenUsageChange('light', 'outputTokens', parseComma(e.target.value) * 1000)}
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
                      value={formatComma(tokenUsage.heavy.inputTokens / 1000)}
                      onChange={(e) => handleTokenUsageChange('heavy', 'inputTokens', parseComma(e.target.value) * 1000)}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-100 font-bold font-mono text-lg text-right focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-0.5 font-medium">Output 토큰 수 (k)</label>
                    <input
                      type="text"
                      value={formatComma(tokenUsage.heavy.outputTokens / 1000)}
                      onChange={(e) => handleTokenUsageChange('heavy', 'outputTokens', parseComma(e.target.value) * 1000)}
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
                      value={formatComma(tokenUsage.stdDev.inputTokens / 1000)}
                      onChange={(e) => handleTokenUsageChange('stdDev', 'inputTokens', parseComma(e.target.value) * 1000)}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-100 font-bold font-mono text-lg text-right focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-0.5 font-medium">Output 토큰 수 (k)</label>
                    <input
                      type="text"
                      value={formatComma(tokenUsage.stdDev.outputTokens / 1000)}
                      onChange={(e) => handleTokenUsageChange('stdDev', 'outputTokens', parseComma(e.target.value) * 1000)}
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
                      value={formatComma(tokenUsage.heavyDev.inputTokens / 1000)}
                      onChange={(e) => handleTokenUsageChange('heavyDev', 'inputTokens', parseComma(e.target.value) * 1000)}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-100 font-bold font-mono text-lg text-right focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-0.5 font-medium">Output 토큰 수 (k)</label>
                    <input
                      type="text"
                      value={formatComma(tokenUsage.heavyDev.outputTokens / 1000)}
                      onChange={(e) => handleTokenUsageChange('heavyDev', 'outputTokens', parseComma(e.target.value) * 1000)}
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
                .map((model, index) => (
                  <tr key={index} className="hover:bg-slate-800/20 transition-colors">
                    <td className="py-4 px-4 font-bold">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-md border text-xs font-bold ${getProviderBgColor(model.provider)}`}>
                        {model.provider}
                      </span>
                    </td>
                    <td className="py-4 px-4 font-semibold text-white">{model.modelName}</td>
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
                ))}
            </tbody>
          </table>
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
