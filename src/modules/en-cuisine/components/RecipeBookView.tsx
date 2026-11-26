import { useMemo, useState } from 'react';
import {
  BookOpen,
  ChefHat,
  FlaskConical,
  Pencil,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import {
  Product,
  RecipeCategory,
  RecipeVersion,
} from '../../../types';
import { BuilderDraftState } from '../types';
import { formatKwd, formatWeightText } from '../utils/formulationEngine';
import { ALL_RECIPE_CATEGORIES } from '../utils/versionPersistence';

interface RecipeBookViewProps {
  products: Product[];
  recipeVersions: RecipeVersion[];
  draft: BuilderDraftState;
  draftTotalG: number;
  draftTotalCostKwd: number;
  readOnly: boolean;
  onCreateNewRecipe: () => void;
  onLoadBananaCake: () => void;
  onResumeWorkspace: () => void;
  onOpenProductInBuilder: (
    product: Product,
    latestVersion: RecipeVersion | undefined
  ) => void;
  onSendProductToTestBatch: (
    product: Product,
    latestVersion: RecipeVersion
  ) => void;
}

const VALIDATION_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'text-slate-600' },
  testing: { label: 'In Test Batch', color: 'text-amber-700' },
  consumer_validated: { label: 'Consumer Validated', color: 'text-teal-700' },
  production_validated: { label: 'Production Validated', color: 'text-emerald-700' },
  approved: { label: 'Approved', color: 'text-emerald-800' },
};

export function RecipeBookView({
  products,
  recipeVersions,
  draft,
  draftTotalG,
  draftTotalCostKwd,
  readOnly,
  onCreateNewRecipe,
  onLoadBananaCake,
  onResumeWorkspace,
  onOpenProductInBuilder,
  onSendProductToTestBatch,
}: RecipeBookViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | RecipeCategory>('ALL');

  const bookEntries = useMemo(() => {
    return products.map((product) => {
      const versions = recipeVersions
        .filter((v) => v.productId === product.id)
        .sort((a, b) => b.versionNumber - a.versionNumber);
      const latest =
        versions.find((v) => v.id === product.currentRecipeVersionId) ||
        versions[0];

      const totalBatchCost = latest
        ? (latest.expectedCost || 0) +
          (latest.packagingCostKwd || 0) +
          (latest.overheadCostKwd || 0)
        : 0;
      const batchWeightG = latest?.batchSize || 0;
      const portionWeightG = latest?.targetPieceWeightG || 90;
      const exactPortions =
        batchWeightG > 0 && portionWeightG > 0
          ? batchWeightG / portionWeightG
          : latest?.expectedYield || 0;
      const costPerPortion =
        exactPortions > 0 ? totalBatchCost / exactPortions : 0;
      const costPerGram = batchWeightG > 0 ? totalBatchCost / batchWeightG : 0;

      return {
        product,
        latest,
        versionCount: versions.length,
        totalBatchCost,
        batchWeightG,
        portionWeightG,
        exactPortions,
        costPerPortion,
        costPerGram,
      };
    });
  }, [products, recipeVersions]);

  const filteredEntries = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return bookEntries.filter((entry) => {
      if (selectedCategory !== 'ALL' && entry.product.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      const ingMatch = (entry.latest?.ingredients || []).some((i) =>
        i.name.toLowerCase().includes(q)
      );
      return (
        entry.product.name.toLowerCase().includes(q) ||
        entry.product.category.toLowerCase().includes(q) ||
        ingMatch
      );
    });
  }, [bookEntries, searchTerm, selectedCategory]);

  const stats = useMemo(() => {
    const approved = bookEntries.filter(
      (e) => e.product.status === 'active' || e.latest?.validationStatus === 'approved'
    ).length;
    const withCost = bookEntries.filter((e) => e.costPerPortion > 0);
    const avgPortionCost =
      withCost.length > 0
        ? withCost.reduce((s, e) => s + e.costPerPortion, 0) / withCost.length
        : 0;
    const inTesting = bookEntries.filter(
      (e) => e.latest?.validationStatus === 'testing'
    ).length;
    return {
      total: bookEntries.length,
      approved,
      avgPortionCost,
      inTesting,
    };
  }, [bookEntries]);

  return (
    <div className="space-y-5">
      {/* Recipe Book Header */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#0B3B2B]" />
            <h2 className="text-lg font-bold text-slate-900">
              Professional Recipe Book
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            Open any formulation to adjust ingredients from the additive library, scale batch weight (e.g. 1 kg Banana Cake), compute per-gram &amp; portion KWD costs, request supplier quotes, or send straight to a Test Batch.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onLoadBananaCake}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#0B3B2B] bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5" />
            1 kg Banana Cake Demo
          </button>
          {!readOnly && (
            <button
              type="button"
              onClick={onCreateNewRecipe}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-md whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Create New Recipe
            </button>
          )}
        </div>
      </div>

      {/* Active Workspace Resume Strip */}
      {draft.items.length > 0 && (
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs space-y-0.5">
            <div className="font-semibold text-[#0B3B2B]">
              Active Builder Workspace: {draft.name || 'Untitled Recipe'}
            </div>
            <div className="text-slate-600 font-mono tabular-nums">
              {draft.items.length} ingredients · {formatWeightText(draftTotalG)} · Portion {draft.unitWeightG} g · Batch Cost {formatKwd(draftTotalCostKwd)}
            </div>
          </div>
          <button
            type="button"
            onClick={onResumeWorkspace}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0B3B2B] hover:bg-[#08291E] rounded-md whitespace-nowrap shrink-0"
          >
            <Pencil className="w-3.5 h-3.5" />
            Resume in Builder
          </button>
        </div>
      )}

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-md p-3.5">
          <div className="text-xs text-slate-500">Saved Recipes</div>
          <div className="mt-1 font-mono tabular-nums text-xl font-bold text-slate-900">
            {stats.total}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-3.5">
          <div className="text-xs text-slate-500">In Test Batch</div>
          <div className="mt-1 font-mono tabular-nums text-xl font-bold text-amber-700">
            {stats.inTesting}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-3.5">
          <div className="text-xs text-slate-500">Approved Menu Recipes</div>
          <div className="mt-1 font-mono tabular-nums text-xl font-bold text-[#0B3B2B]">
            {stats.approved}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-3.5">
          <div className="text-xs text-slate-500">Avg Cost / Portion</div>
          <div className="mt-1 font-mono tabular-nums text-xl font-bold text-slate-900">
            {formatKwd(stats.avgPortionCost)}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border whitespace-nowrap ${
              selectedCategory === 'ALL'
                ? 'bg-[#0B3B2B] text-white border-[#0B3B2B]'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            All ({bookEntries.length})
          </button>
          {ALL_RECIPE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-[#0B3B2B] text-white border-[#0B3B2B]'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search recipe or ingredient..."
            className="w-full lg:w-64 pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md"
          />
        </div>
      </div>

      {/* Recipe Book Grid */}
      {filteredEntries.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-lg p-10 text-center space-y-3">
          <ChefHat className="w-9 h-9 text-slate-300 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-900">
              {bookEntries.length === 0
                ? 'Your Recipe Book is ready for your first formulation'
                : 'No recipes match your current filter'}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Create a new recipe from scratch using the Ingredient &amp; Additive Library, or start from our 1 kg Banana Cake template and customize portion weights.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {!readOnly && (
              <button
                type="button"
                onClick={onCreateNewRecipe}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-md"
              >
                <Plus className="w-3.5 h-3.5" />
                Create New Recipe
              </button>
            )}
            <button
              type="button"
              onClick={onLoadBananaCake}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#0B3B2B] bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100"
            >
              Open 1 kg Banana Cake in Builder
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredEntries.map((entry) => {
            const { product, latest } = entry;
            const statusMeta =
              VALIDATION_LABELS[latest?.validationStatus || 'draft'] ||
              VALIDATION_LABELS.draft;
            const topIngredients = (latest?.ingredients || [])
              .filter((i) => !i.isPackaging)
              .slice(0, 4)
              .map((i) => `${i.name} (${i.amountG}g)`)
              .join(' · ');

            return (
              <article
                key={product.id}
                className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between gap-4 hover:border-slate-300 transition-colors"
              >
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <span>{product.category}</span>
                      <span>·</span>
                      <span className="font-mono">
                        v{latest?.versionNumber || 1}.0
                      </span>
                      <span>·</span>
                      <span className={`font-semibold ${statusMeta.color}`}>
                        {statusMeta.label}
                      </span>
                    </div>
                    <h3 className="mt-1 text-base font-bold text-slate-900 truncate">
                      {product.name}
                    </h3>
                  </div>

                  {/* Quantitative Batch & Portion Cost Matrix */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 py-2.5 border-y border-slate-100 text-xs">
                    <div>
                      <div className="text-[11px] text-slate-500">Recipe Batch</div>
                      <div className="font-mono tabular-nums font-semibold text-slate-900">
                        {formatWeightText(entry.batchWeightG)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500">Portion Size</div>
                      <div className="font-mono tabular-nums font-semibold text-slate-900">
                        {entry.portionWeightG} g ({entry.exactPortions.toFixed(1)} pcs)
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500">Total Recipe Cost</div>
                      <div className="font-mono tabular-nums font-bold text-slate-900">
                        {formatKwd(entry.totalBatchCost)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500">Cost / Portion</div>
                      <div className="font-mono tabular-nums font-bold text-[#0B3B2B]">
                        {formatKwd(entry.costPerPortion)}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1 text-[11px] text-slate-600">
                    <div className="font-mono tabular-nums text-slate-500">
                      Cost/g: {formatKwd(entry.costPerGram, 4)} · Target Sell:{' '}
                      <span className="font-semibold text-orange-700">
                        {formatKwd(latest?.suggestedPriceKwd || product.sellingPriceKwd || 0)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-slate-500">
                      {topIngredients || 'No ingredients listed'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => onOpenProductInBuilder(product, latest)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#0B3B2B] hover:bg-[#08291E] rounded-md whitespace-nowrap"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Open in Builder
                  </button>
                  {latest && !readOnly && (
                    <button
                      type="button"
                      onClick={() => onSendProductToTestBatch(product, latest)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-md whitespace-nowrap"
                    >
                      <FlaskConical className="w-3.5 h-3.5" />
                      Test Batch
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
