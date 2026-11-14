import { CustomFormQuestion, FormProcessType, ProductionBatch } from '../types';

export interface CreatedGoogleFormResult {
  formId: string;
  responderUri: string;
  title: string;
}

export interface BatchFormStats {
  batchNumber: string;
  responseCount: number;
  avgFlavor: number;
  avgTexture: number;
  avgSweetness: number;
  avgProcessScore: number;
  avgCombined10: number;
  willingToPayPct: number;
}

export interface SyncedFormResponsesResult {
  totalResponses: number;
  batchStats: Record<string, BatchFormStats>;
  bestBatchNumber: string;
  bestBatchScore10: number;
  overallWillingToPayPct: number;
  overallAvgSweetness: number;
}

export interface FormQuestionPreview {
  category: 'Common' | 'Hot Process' | 'Cold Process' | 'Pricing';
  title: string;
  detail: string;
}

export function buildProcessQuestionPreview(
  processType: FormProcessType,
  testedPricePoint: number
): FormQuestionPreview[] {
  const priceStr = `$${Math.max(0, testedPricePoint).toFixed(2)}`;
  const isHot = processType === 'hot';

  return [
    {
      category: 'Common',
      title: 'Batch Number & Product Evaluated',
      detail: 'Multiple choice list of all batches produced on the selected date.',
    },
    {
      category: 'Common',
      title: 'Sweetness Level (1–5 Scale)',
      detail: '1 = Not sweet enough, 3 = Ideal / balanced, 5 = Too sweet.',
    },
    {
      category: 'Common',
      title: 'Texture Rating (1–5 Scale)',
      detail: isHot
        ? 'Warm crumb, crust crispness, tenderness, or hot viscosity.'
        : 'Chilled firmness, creaminess, snap, or cold-set stability.',
    },
    {
      category: 'Common',
      title: 'Quantity & Portion Size',
      detail: 'Too Small / Just Right / Too Large.',
    },
    {
      category: 'Pricing',
      title: `Price Point Willingness to Pay (${priceStr})`,
      detail: `Tests whether responders would pay ${priceStr} (Yes / Maybe / No).`,
    },
    {
      category: isHot ? 'Hot Process' : 'Cold Process',
      title: isHot
        ? 'Thermal Finish, Heat Retention & Crust/Sear (1–5 Scale)'
        : 'Chilled Freshness, Emulsion & Structural Hold (1–5 Scale)',
      detail: isHot
        ? 'Baking/cooking doneness, Maillard color, and warm serving retention.'
        : 'Cold-set stability, moisture hold without weeping, and clean mouthfeel.',
    },
    {
      category: isHot ? 'Hot Process' : 'Cold Process',
      title: isHot
        ? 'Warm Aroma & Flavor Depth (1–5 Scale)'
        : 'Cooling Refreshment & Flavor Clarity (1–5 Scale)',
      detail: isHot
        ? 'Roasted/baked aroma release and warm flavor intensity.'
        : 'Flavor brightness at chilled serving temperature with no off-notes.',
    },
  ];
}

export function buildCustomQuestionRequest(
  q: CustomFormQuestion,
  index: number
): Record<string, unknown> {
  if (q.type === 'scale') {
    return {
      createItem: {
        item: {
          title: q.title,
          questionItem: {
            question: {
              required: q.required,
              scaleQuestion: {
                low: 1,
                high: 5,
                lowLabel: 'Low / Poor',
                highLabel: 'High / Excellent',
              },
            },
          },
        },
        location: { index },
      },
    };
  }

  if (q.type === 'choice') {
    const cleanOptions = (q.options || [])
      .map((o) => o.trim())
      .filter(Boolean)
      .slice(0, 12);
    const finalOptions =
      cleanOptions.length >= 2
        ? cleanOptions.map((value) => ({ value }))
        : [{ value: 'Yes' }, { value: 'No' }];
    return {
      createItem: {
        item: {
          title: q.title,
          questionItem: {
            question: {
              required: q.required,
              choiceQuestion: {
                type: 'RADIO',
                options: finalOptions,
                shuffle: false,
              },
            },
          },
        },
        location: { index },
      },
    };
  }

  return {
    createItem: {
      item: {
        title: q.title,
        questionItem: {
          question: {
            required: q.required,
            textQuestion: {
              paragraph: true,
            },
          },
        },
      },
      location: { index },
    },
  };
}

export async function createBatchEvaluationForm(
  accessToken: string,
  params: {
    title: string;
    date: string;
    processType: FormProcessType;
    testedPricePoint: number;
    batches: ProductionBatch[];
    customQuestions?: CustomFormQuestion[];
  }
): Promise<CreatedGoogleFormResult> {
  const createRes = await fetch('https://forms.googleapis.com/v1/forms', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      info: {
        title: params.title,
        documentTitle: params.title,
      },
    }),
  });

  if (!createRes.ok) {
    const errBody = await createRes.text();
    throw new Error(`Google Forms create failed (${createRes.status}): ${errBody}`);
  }

  const created = await createRes.json();
  const formId: string = created.formId;
  const responderUri: string =
    created.responderUri ||
    `https://docs.google.com/forms/d/${encodeURIComponent(formId)}/viewform`;

  const isHot = params.processType === 'hot';
  const processLabel = isHot ? 'Hot Process' : 'Cold Process';
  const priceStr = `$${Math.max(0, params.testedPricePoint).toFixed(2)}`;

  const batchOptions = params.batches.map((b) => ({
    value: `${b.batchNumber} — ${b.productName} (${b.quantityProduced} ${b.unit})`,
  }));

  const safeFormId = encodeURIComponent(formId.trim());
  const updateRes = await fetch(
    `https://forms.googleapis.com/v1/forms/${safeFormId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            updateFormInfo: {
              info: {
                description: `${processLabel} batch evaluation for ${params.date} · Attached Price Point: ${priceStr}. Select your Batch Number & Product to evaluate sweetness, texture, portion quantity, ${processLabel.toLowerCase()} execution, and price acceptance.`,
              },
              updateMask: 'description',
            },
          },
          {
            createItem: {
              item: {
                title: 'Batch Number & Product Evaluated',
                description: 'Select the exact batch number printed on the production sample.',
                questionItem: {
                  question: {
                    required: true,
                    choiceQuestion: {
                      type: 'RADIO',
                      options: batchOptions,
                      shuffle: false,
                    },
                  },
                },
              },
              location: { index: 0 },
            },
          },
          {
            createItem: {
              item: {
                title: 'Sweetness Level',
                description:
                  'Rate sweetness balance (1 = Not sweet enough, 3 = Ideal / Balanced, 5 = Too sweet).',
                questionItem: {
                  question: {
                    required: true,
                    scaleQuestion: {
                      low: 1,
                      high: 5,
                      lowLabel: 'Not Sweet Enough',
                      highLabel: 'Too Sweet',
                    },
                  },
                },
              },
              location: { index: 1 },
            },
          },
          {
            createItem: {
              item: {
                title: 'Texture Rating',
                description: isHot
                  ? 'Hot process: evaluate warm crumb, crust crispness, tenderness, or hot viscosity.'
                  : 'Cold process: evaluate chilled firmness, creaminess, snap, or cold-set stability.',
                questionItem: {
                  question: {
                    required: true,
                    scaleQuestion: {
                      low: 1,
                      high: 5,
                      lowLabel: isHot ? 'Dry / Soggy' : 'Grainy / Soft',
                      highLabel: isHot ? 'Ideal Hot Texture' : 'Ideal Cold Texture',
                    },
                  },
                },
              },
              location: { index: 2 },
            },
          },
          {
            createItem: {
              item: {
                title: 'Quantity & Portion Size',
                description: 'How does the sample portion / pack quantity feel for this product?',
                questionItem: {
                  question: {
                    required: true,
                    choiceQuestion: {
                      type: 'RADIO',
                      options: [
                        { value: 'Too Small' },
                        { value: 'Just Right' },
                        { value: 'Too Large' },
                      ],
                      shuffle: false,
                    },
                  },
                },
              },
              location: { index: 3 },
            },
          },
          {
            createItem: {
              item: {
                title: `Price Point Willingness to Pay (${priceStr})`,
                description: `Target retail price attached to this batch: ${priceStr}. Based on the taste, texture, and quantity, would you be willing to pay ${priceStr}?`,
                questionItem: {
                  question: {
                    required: true,
                    choiceQuestion: {
                      type: 'RADIO',
                      options: [
                        { value: `Yes — Willing to pay ${priceStr}` },
                        { value: `Maybe — Worth ${priceStr} with minor tweaks` },
                        { value: `No — Price feels too high at ${priceStr}` },
                      ],
                      shuffle: false,
                    },
                  },
                },
              },
              location: { index: 4 },
            },
          },
          {
            createItem: {
              item: {
                title: isHot
                  ? 'Hot Process: Thermal Finish, Heat Retention & Crust'
                  : 'Cold Process: Chilled Freshness, Emulsion & Structural Hold',
                description: isHot
                  ? 'Rate baking/cooking doneness, caramelization/Maillard color, and warm serving retention.'
                  : 'Rate cold-set stability, moisture retention without weeping, and chilled mouthfeel.',
                questionItem: {
                  question: {
                    required: true,
                    scaleQuestion: {
                      low: 1,
                      high: 5,
                      lowLabel: isHot ? 'Under / Overdone' : 'Separated / Flat',
                      highLabel: isHot ? 'Benchmark Thermal Finish' : 'Crisp & Stable Hold',
                    },
                  },
                },
              },
              location: { index: 5 },
            },
          },
          {
            createItem: {
              item: {
                title: isHot
                  ? 'Hot Process: Warm Aroma & Flavor Depth'
                  : 'Cold Process: Cooling Refreshment & Flavor Clarity',
                description: isHot
                  ? 'Rate roasted/baked aroma release and warm flavor balance.'
                  : 'Rate brightness of flavor at chilled temperature with no off-notes.',
                questionItem: {
                  question: {
                    required: true,
                    scaleQuestion: {
                      low: 1,
                      high: 5,
                      lowLabel: 'Flat / Muted',
                      highLabel: 'Exceptional Flavor',
                    },
                  },
                },
              },
              location: { index: 6 },
            },
          },
          {
            createItem: {
              item: {
                title: 'Tasting, Process & Price Feedback',
                description: `Additional notes on sweetness, texture, portion size, ${processLabel.toLowerCase()} quality, or the ${priceStr} price point.`,
                questionItem: {
                  question: {
                    required: false,
                    textQuestion: {
                      paragraph: true,
                    },
                  },
                },
              },
              location: { index: 7 },
            },
          },
          ...(params.customQuestions || []).map((q, offset) =>
            buildCustomQuestionRequest(q, 8 + offset)
          ),
        ],
      }),
    }
  );

  if (!updateRes.ok) {
    const errBody = await updateRes.text();
    throw new Error(`Google Forms batchUpdate failed (${updateRes.status}): ${errBody}`);
  }

  return {
    formId,
    responderUri,
    title: params.title,
  };
}

export async function appendQuestionToGoogleForm(
  accessToken: string,
  formId: string,
  question: CustomFormQuestion
): Promise<void> {
  const safeFormId = encodeURIComponent(formId.trim());
  const formRes = await fetch(`https://forms.googleapis.com/v1/forms/${safeFormId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!formRes.ok) {
    const errTxt = await formRes.text();
    throw new Error(`Failed to inspect Google Form (${formRes.status}): ${errTxt}`);
  }
  const formJson = await formRes.json();
  const nextIndex = Array.isArray(formJson.items) ? formJson.items.length : 0;

  const updateRes = await fetch(
    `https://forms.googleapis.com/v1/forms/${safeFormId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [buildCustomQuestionRequest(question, nextIndex)],
      }),
    }
  );

  if (!updateRes.ok) {
    const errTxt = await updateRes.text();
    throw new Error(`Failed to add question to Google Form (${updateRes.status}): ${errTxt}`);
  }
}

export async function fetchBatchFormResponses(
  accessToken: string,
  formId: string
): Promise<SyncedFormResponsesResult> {
  const safeFormId = encodeURIComponent(formId.trim());

  const [formRes, responsesRes] = await Promise.all([
    fetch(`https://forms.googleapis.com/v1/forms/${safeFormId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    fetch(`https://forms.googleapis.com/v1/forms/${safeFormId}/responses`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  ]);

  if (!formRes.ok) {
    const txt = await formRes.text();
    throw new Error(`Failed to read Google Form (${formRes.status}): ${txt}`);
  }
  if (!responsesRes.ok) {
    const txt = await responsesRes.text();
    throw new Error(`Failed to read Google Form responses (${responsesRes.status}): ${txt}`);
  }

  const formJson = await formRes.json();
  const responsesJson = await responsesRes.json();

  let batchQuestionId = '';
  let sweetnessQuestionId = '';
  let textureQuestionId = '';
  let priceQuestionId = '';
  let processQuestionId = '';
  let flavorQuestionId = '';

  const items = Array.isArray(formJson.items) ? formJson.items : [];
  for (const item of items) {
    const qId = item?.questionItem?.question?.questionId;
    const title = String(item?.title || '').toLowerCase();
    if (!qId) continue;
    if (title.includes('batch')) batchQuestionId = qId;
    else if (title.includes('sweetness')) sweetnessQuestionId = qId;
    else if (title.includes('texture')) textureQuestionId = qId;
    else if (title.includes('price') || title.includes('willing')) priceQuestionId = qId;
    else if (title.includes('thermal') || title.includes('chilled freshness')) processQuestionId = qId;
    else if (title.includes('flavor') || title.includes('aroma')) flavorQuestionId = qId;
  }

  const rawResponses = Array.isArray(responsesJson.responses) ? responsesJson.responses : [];
  const accum: Record<
    string,
    {
      count: number;
      flavorSum: number;
      flavorCount: number;
      textureSum: number;
      textureCount: number;
      sweetnessSum: number;
      sweetnessCount: number;
      processSum: number;
      processCount: number;
      priceYesCount: number;
      priceAnswerCount: number;
    }
  > = {};

  let totalSweetnessSum = 0;
  let totalSweetnessCount = 0;
  let totalPriceYesCount = 0;
  let totalPriceAnswerCount = 0;

  for (const resp of rawResponses) {
    const answers = resp?.answers || {};
    const batchAns = answers[batchQuestionId]?.textAnswers?.answers?.[0]?.value;
    if (!batchAns) continue;

    const batchNumber = String(batchAns).split('—')[0].trim();
    if (!accum[batchNumber]) {
      accum[batchNumber] = {
        count: 0,
        flavorSum: 0,
        flavorCount: 0,
        textureSum: 0,
        textureCount: 0,
        sweetnessSum: 0,
        sweetnessCount: 0,
        processSum: 0,
        processCount: 0,
        priceYesCount: 0,
        priceAnswerCount: 0,
      };
    }

    const bucket = accum[batchNumber];
    bucket.count += 1;

    const flavorVal = Number(answers[flavorQuestionId]?.textAnswers?.answers?.[0]?.value || 0);
    if (flavorVal > 0) {
      bucket.flavorSum += flavorVal;
      bucket.flavorCount += 1;
    }

    const textureVal = Number(answers[textureQuestionId]?.textAnswers?.answers?.[0]?.value || 0);
    if (textureVal > 0) {
      bucket.textureSum += textureVal;
      bucket.textureCount += 1;
    }

    const sweetnessVal = Number(answers[sweetnessQuestionId]?.textAnswers?.answers?.[0]?.value || 0);
    if (sweetnessVal > 0) {
      bucket.sweetnessSum += sweetnessVal;
      bucket.sweetnessCount += 1;
      totalSweetnessSum += sweetnessVal;
      totalSweetnessCount += 1;
    }

    const processVal = Number(answers[processQuestionId]?.textAnswers?.answers?.[0]?.value || 0);
    if (processVal > 0) {
      bucket.processSum += processVal;
      bucket.processCount += 1;
    }

    const priceAns = String(
      answers[priceQuestionId]?.textAnswers?.answers?.[0]?.value || ''
    ).toLowerCase();
    if (priceAns) {
      bucket.priceAnswerCount += 1;
      totalPriceAnswerCount += 1;
      if (priceAns.startsWith('yes')) {
        bucket.priceYesCount += 1;
        totalPriceYesCount += 1;
      }
    }
  }

  const batchStats: Record<string, BatchFormStats> = {};
  let bestBatchNumber = '';
  let bestBatchScore10 = 0;

  for (const [batchNumber, agg] of Object.entries(accum)) {
    const avgFlavor = agg.flavorCount > 0 ? agg.flavorSum / agg.flavorCount : 0;
    const avgTexture = agg.textureCount > 0 ? agg.textureSum / agg.textureCount : 0;
    const avgSweetness = agg.sweetnessCount > 0 ? agg.sweetnessSum / agg.sweetnessCount : 0;
    const avgProcessScore = agg.processCount > 0 ? agg.processSum / agg.processCount : 0;

    // Normalize available 5-point sensory criteria into a 0-10 rating
    const activeMetrics = [avgFlavor, avgTexture, avgProcessScore].filter((v) => v > 0);
    const avg5 =
      activeMetrics.length > 0
        ? activeMetrics.reduce((s, v) => s + v, 0) / activeMetrics.length
        : 0;
    const avgCombined10 = Number((avg5 * 2).toFixed(2));
    const willingToPayPct =
      agg.priceAnswerCount > 0
        ? Math.round((agg.priceYesCount / agg.priceAnswerCount) * 100)
        : 0;

    batchStats[batchNumber] = {
      batchNumber,
      responseCount: agg.count,
      avgFlavor: Number(avgFlavor.toFixed(2)),
      avgTexture: Number(avgTexture.toFixed(2)),
      avgSweetness: Number(avgSweetness.toFixed(2)),
      avgProcessScore: Number(avgProcessScore.toFixed(2)),
      avgCombined10,
      willingToPayPct,
    };

    if (avgCombined10 > bestBatchScore10) {
      bestBatchScore10 = avgCombined10;
      bestBatchNumber = batchNumber;
    }
  }

  return {
    totalResponses: rawResponses.length,
    batchStats,
    bestBatchNumber,
    bestBatchScore10,
    overallWillingToPayPct:
      totalPriceAnswerCount > 0
        ? Math.round((totalPriceYesCount / totalPriceAnswerCount) * 100)
        : 0,
    overallAvgSweetness:
      totalSweetnessCount > 0
        ? Number((totalSweetnessSum / totalSweetnessCount).toFixed(2))
        : 0,
  };
}
