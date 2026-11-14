import { useMemo, useState } from 'react';
import { FlaskConical, Plus, Trash2, Copy } from 'lucide-react';
import { deleteDoc, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  Booking,
  LIMITS,
  RawMaterial,
  RecipeCategory,
  RecipeIngredient,
  RecipeOutcome,
  RecipeTest,
  clampStr,
} from '../types';

interface RecipesViewProps {
  uid: string;
  userName: string;
  recipes: RecipeTest[];
  materials: RawMaterial[];
  bookings: Booking[];
  loading: boolean;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

const RECIPE_CATEGORIES: RecipeCategory[] = [
  'Bakery',
  'Sauce & Emulsion',
  'Fermentation',
  'Plant-Based',
  'Confectionery',
  'Savory Prep',
];

export function RecipesView({
  uid,
  userName,
  recipes,
  materials,
  bookings,
  loading,
  onNotify,
}: RecipesViewProps) {
  const [title, setTitle] = useState('');
  const [version, setVersion] = useState('v1.0');
  const [category, setCategory] = useState<RecipeCategory>('Bakery');
  const [bookingId, setBookingId] = useState('');
  const [prepMinutes, setPrepMinutes] = useState('90');
  const [targetTempC, setTargetTempC] = useState('215');
  const [yieldText, setYieldText] = useState('24 units / 4.2 kg');
  const [tastingNotes, setTastingNotes] = useState('');
  const [outcome, setOutcome] = useState<RecipeOutcome>('iterate');
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([
    { name: '', amount: 500, unit: 'g' },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const [selectedOutcomeFilter, setSelectedOutcomeFilter] = useState<'all' | RecipeOutcome>('all');
  const [activeRecipeId, setActiveRecipeId] = useState<string | null>(null);

  const addIngredientRow = () => {
    if (ingredients.length >= 40) return;
    setIngredients((prev) => [...prev, { name: '', amount: 100, unit: 'g' }]);
  };

  const updateIngredientRow = (index: number, patch: Partial<RecipeIngredient>) => {
    setIngredients((prev) => prev.map((row, idx) => (idx === index ? { ...row, ...patch } : row)));
  };

  const removeIngredientRow = (index: number) => {
    setIngredients((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSaveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = clampStr(title, LIMITS.TITLE_MAX);
    if (!cleanTitle) {
      onNotify('Enter a recipe title.', 'error');
      return;
    }

    const validIngredients = ingredients
      .filter((i) => i.name.trim().length > 0)
      .slice(0, 40)
      .map((i) => ({
        name: clampStr(i.name, 80),
        amount: Math.max(0, Number(i.amount) || 0),
        unit: clampStr(i.unit || 'g', 16),
      }));

    const recipeId = `rcp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = serverTimestamp();

    setSubmitting(true);
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'recipes', recipeId), {
        ownerId: uid,
        title: cleanTitle,
        version: clampStr(version || 'v1.0', LIMITS.VERSION_MAX),
        category,
        bookingId: clampStr(bookingId, 128),
        prepMinutes: Math.max(0, Number(prepMinutes) || 0),
        targetTempC: Number(targetTempC) || 0,
        yieldText: clampStr(yieldText, LIMITS.YIELD_MAX),
        ingredients: validIngredients,
        tastingNotes: clampStr(tastingNotes, LIMITS.TASTING_NOTES_MAX),
        outcome,
        createdAt: now,
        updatedAt: now,
      });

      batch.set(doc(db, 'logs', logId), {
        ownerId: uid,
        actorName: clampStr(userName || 'Kitchen Member', LIMITS.NAME_MAX),
        eventType: 'recipe',
        severity: outcome === 'approved' ? 'info' : 'warn',
        station: category,
        tempReadingC: String(Number(targetTempC) || 0),
        message: clampStr(
          `Tested recipe "${cleanTitle}" (${version}) — Outcome: ${outcome.toUpperCase()}, Yield: ${yieldText}.`,
          LIMITS.LOG_MSG_MAX
        ),
        bookingId: clampStr(bookingId, 128),
        createdAt: now,
      });

      await batch.commit();
      setTitle('');
      setTastingNotes('');
      setIngredients([{ name: '', amount: 500, unit: 'g' }]);
      setActiveRecipeId(recipeId);
      onNotify(`Saved recipe test "${cleanTitle}" (${version}).`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `recipes/${recipeId}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateOutcome = async (recipe: RecipeTest, nextOutcome: RecipeOutcome) => {
    if (recipe.outcome === 'archived') return;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'recipes', recipe.id), {
        outcome: nextOutcome,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      onNotify(`Updated ${recipe.title} outcome to ${nextOutcome}.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `recipes/${recipe.id}`);
    }
  };

  const handleCloneNextVersion = (recipe: RecipeTest) => {
    const match = recipe.version.match(/v?(\d+)\.(\d+)/i);
    const nextVer = match ? `v${match[1]}.${Number(match[2]) + 1}` : `${recipe.version}.1`;
    setTitle(recipe.title);
    setVersion(nextVer);
    setCategory(recipe.category);
    setBookingId(recipe.bookingId);
    setPrepMinutes(String(recipe.prepMinutes));
    setTargetTempC(String(recipe.targetTempC));
    setYieldText(recipe.yieldText);
    setIngredients(
      recipe.ingredients.length > 0 ? recipe.ingredients : [{ name: '', amount: 100, unit: 'g' }]
    );
    setTastingNotes(`Iterated from ${recipe.version}: `);
    setOutcome('iterate');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteRecipe = async (recipe: RecipeTest) => {
    try {
      await deleteDoc(doc(db, 'recipes', recipe.id));
      if (activeRecipeId === recipe.id) setActiveRecipeId(null);
      onNotify(`Deleted recipe record "${recipe.title}".`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `recipes/${recipe.id}`);
    }
  };

  const filteredRecipes = useMemo(() => {
    return recipes.filter(
      (r) => selectedOutcomeFilter === 'all' || r.outcome === selectedOutcomeFilter
    );
  }, [recipes, selectedOutcomeFilter]);

  const activeRecipe = useMemo(
    () => filteredRecipes.find((r) => r.id === activeRecipeId) || filteredRecipes[0] || null,
    [filteredRecipes, activeRecipeId]
  );

  if (loading) {
    return <div className="h-64 bg-white border border-slate-200 rounded-lg animate-pulse" />;
  }

  return (
    <div className="space-y-8">
      {/* Record New Recipe Test */}
      <form onSubmit={handleSaveRecipe} className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
        <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Record Recipe Test Trial</h2>
            <p className="text-sm text-slate-600">
              Document formulation ratios, oven/cook temperatures, sensory evaluation, and trial outcomes.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {recipes.length} trials logged
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <label className="block space-y-1.5 lg:col-span-2">
            <span className="text-xs font-medium text-slate-700">Recipe / Batch Title</span>
            <input
              type="text"
              maxLength={LIMITS.TITLE_MAX}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Cultured Butter Kouign-Amann"
              required
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-700">Trial Version</span>
            <input
              type="text"
              maxLength={LIMITS.VERSION_MAX}
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-700">Category</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as RecipeCategory)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
            >
              {RECIPE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-700">Prep & Bake Time (min)</span>
            <input
              type="number"
              min="0"
              value={prepMinutes}
              onChange={(e) => setPrepMinutes(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-700">Target Temp (°C)</span>
            <input
              type="number"
              min="-50"
              max="400"
              value={targetTempC}
              onChange={(e) => setTargetTempC(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-700">Batch Yield</span>
            <input
              type="text"
              maxLength={LIMITS.YIELD_MAX}
              value={yieldText}
              onChange={(e) => setYieldText(e.target.value)}
              placeholder="e.g. 24 loaves / 12 kg"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-700">Linked Session</span>
            <select
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
            >
              <option value="">Standalone R&D Test</option>
              {bookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.date} · {b.spaceName}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Formulation Ingredients */}
        <div className="space-y-2.5 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">Formulation Ingredients</span>
            <button
              type="button"
              onClick={addIngredientRow}
              className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Ingredient Row
            </button>
          </div>

          <datalist id="raw-materials-suggestions">
            {materials.map((m) => (
              <option key={m.id} value={m.name} />
            ))}
          </datalist>

          <div className="space-y-2">
            {ingredients.map((row, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <input
                  type="text"
                  list="raw-materials-suggestions"
                  value={row.name}
                  onChange={(e) => updateIngredientRow(idx, { name: e.target.value })}
                  placeholder="Ingredient (pick from raw materials or type)"
                  className="col-span-6 px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={row.amount}
                  onChange={(e) => updateIngredientRow(idx, { amount: Number(e.target.value) })}
                  className="col-span-3 px-3 py-1.5 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
                <input
                  type="text"
                  maxLength={16}
                  value={row.unit}
                  onChange={(e) => updateIngredientRow(idx, { unit: e.target.value })}
                  placeholder="g / mL"
                  className="col-span-2 px-3 py-1.5 text-sm font-mono bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
                <button
                  type="button"
                  onClick={() => removeIngredientRow(idx)}
                  disabled={ingredients.length === 1}
                  className="col-span-1 p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30 flex justify-center"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          <label className="block space-y-1.5 lg:col-span-8">
            <span className="text-xs font-medium text-slate-700">Sensory, Texture & Process Notes</span>
            <textarea
              rows={2}
              maxLength={LIMITS.TASTING_NOTES_MAX}
              value={tastingNotes}
              onChange={(e) => setTastingNotes(e.target.value)}
              placeholder="Crumb openness, caramelization, viscosity, or recommended adjustments for next run..."
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
            />
          </label>

          <label className="block space-y-1.5 lg:col-span-2">
            <span className="text-xs font-medium text-slate-700">Trial Outcome</span>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as RecipeOutcome)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
            >
              <option value="iterate">Needs Iteration</option>
              <option value="approved">Approved</option>
              <option value="archived">Archived</option>
            </select>
          </label>

          <div className="lg:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 text-white text-sm font-semibold rounded-md transition-colors whitespace-nowrap"
            >
              <FlaskConical className="w-4 h-4" />
              {submitting ? 'Saving...' : 'Log Trial'}
            </button>
          </div>
        </div>
      </form>

      {/* Tested Recipes Archive & Detail Split */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Tested Recipe Archive</h2>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
            {(['all', 'approved', 'iterate', 'archived'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setSelectedOutcomeFilter(status)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize whitespace-nowrap shrink-0 ${
                  selectedOutcomeFilter === status
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {status === 'iterate' ? 'Needs Iteration' : status}
              </button>
            ))}
          </div>
        </div>

        {filteredRecipes.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-10 text-center space-y-2">
            <p className="text-sm font-medium text-slate-900">No recipe trials logged yet</p>
            <p className="text-xs text-slate-500">
              Record a formulation trial above to track versions, yields, and sensory notes.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* List */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
              {filteredRecipes.map((r) => {
                const isSelected = activeRecipe?.id === r.id;
                return (
                  <button
                    type="button"
                    key={r.id}
                    onClick={() => setActiveRecipeId(r.id)}
                    className={`w-full text-left p-4 transition-colors ${
                      isSelected ? 'bg-slate-50' : 'hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold text-sm text-slate-900">{r.title}</span>
                      <span className="font-mono text-xs text-slate-500 shrink-0">{r.version}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      <span>{r.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{r.targetTempC}°C</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`font-medium ${
                          r.outcome === 'approved'
                            ? 'text-emerald-700'
                            : r.outcome === 'iterate'
                            ? 'text-amber-700'
                            : 'text-slate-500'
                        }`}
                      >
                        {r.outcome === 'iterate' ? 'Needs Iteration' : r.outcome}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Detail Panel */}
            {activeRecipe && (
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-200 pb-4">
                  <div>
                    <div className="flex items-baseline gap-2.5">
                      <h3 className="text-lg font-semibold text-slate-900">{activeRecipe.title}</h3>
                      <span className="text-xs font-mono text-slate-500">{activeRecipe.version}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{activeRecipe.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{activeRecipe.prepMinutes} min</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{activeRecipe.targetTempC}°C</span>
                      <span aria-hidden="true">·</span>
                      <span>Yield: {activeRecipe.yieldText}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCloneNextVersion(activeRecipe)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Iterate Version
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRecipe(activeRecipe)}
                      className="p-1.5 text-red-600 border border-slate-200 rounded-md hover:bg-red-50"
                      title="Delete recipe trial"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-700 mb-2">Formulation Breakdown</h4>
                  {activeRecipe.ingredients.length === 0 ? (
                    <p className="text-xs text-slate-500">No ingredient breakdown listed.</p>
                  ) : (
                    <div className="border border-slate-200 rounded-md divide-y divide-slate-200">
                      {activeRecipe.ingredients.map((ing, idx) => (
                        <div key={idx} className="px-3 py-2 flex items-center justify-between text-sm">
                          <span className="text-slate-800">{ing.name}</span>
                          <span className="font-mono tabular-nums text-slate-600">
                            {ing.amount} {ing.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-700 mb-1.5">Tasting & Process Notes</h4>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {activeRecipe.tastingNotes || 'No sensory notes recorded for this trial.'}
                  </p>
                </div>

                {activeRecipe.outcome !== 'archived' && (
                  <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-500">Update Trial Outcome</span>
                    <div className="flex items-center gap-2">
                      {(['iterate', 'approved', 'archived'] as const).map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => handleUpdateOutcome(activeRecipe, status)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors capitalize whitespace-nowrap ${
                            activeRecipe.outcome === status
                              ? 'bg-teal-700 border-teal-700 text-white'
                              : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {status === 'iterate' ? 'Iterate' : status}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
