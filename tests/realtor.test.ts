const assert = require('node:assert/strict');

const brief = require('../lib/realtor/brief');
const compliance = require('../lib/realtor/compliance');
const campaign = require('../lib/realtor/campaign');
const report = require('../lib/realtor/report');
const leadforms = require('../lib/realtor/leadforms');
const capi = require('../lib/realtor/capi');

function sampleBrief() {
  return {
    propertyType: 'apartment',
    bhk: '3 BHK',
    city: 'Bengaluru',
    locality: 'Sarjapur',
    price: '₹1,20,00,000',
    possession: 'ready',
    dailyBudget: 500,
    pageId: '123456',
    adAccountId: 'act_789',
    whatsappNumber: '+919876543210',
    message: '3 BHK ready to move in Sarjapur, Bengaluru'
  };
}

module.exports = [
  {
    name: 'realtor parse price in lakhs',
    fn: () => {
      assert.equal(brief.inrAmountFromText('₹85 lakh'), 8500000);
    }
  },
  {
    name: 'realtor parse price in crores',
    fn: () => {
      assert.equal(brief.inrAmountFromText('rs 1.2 crore'), 12000000);
    }
  },
  {
    name: 'realtor parse price in lacs',
    fn: () => {
      assert.equal(brief.inrAmountFromText('12 lacs'), 1200000);
    }
  },
  {
    name: 'realtor parse bhk',
    fn: () => {
      assert.equal(brief.parseBhk('3 BHK apartment'), '3 BHK');
    }
  },
  {
    name: 'realtor parse city',
    fn: () => {
      assert.equal(brief.parseCity('3 BHK in Bengaluru, 1.2 crore'), 'Bengaluru');
    }
  },
  {
    name: 'realtor parse whatsapp number normalizes 10-digit to +91',
    fn: () => {
      assert.equal(brief.parseWhatsAppNumber('9876543210'), '+919876543210');
    }
  },
  {
    name: 'realtor parse full text into brief',
    fn: () => {
      const b = brief.parseBriefText('3 BHK ready to move in Sarjapur, Bengaluru for ₹1.2 crore');
      assert.equal(b.bhk, '3 BHK');
      assert.equal(b.city, 'Bengaluru');
      assert.ok(b.price);
    }
  },
  {
    name: 'realtor required fields detect missing',
    fn: () => {
      const missing = brief.requiredFields({ city: 'Bengaluru', dailyBudget: 500, whatsappNumber: '+919876543210', message: 'x', pageId: '1', adAccountId: 'act_1' }, true);
      assert.deepEqual(missing, []);
    }
  },
  {
    name: 'realtor compliance removes restricted targeting keys',
    fn: () => {
      const result = compliance.sanitizeTargetingForHousing({ age_min: 18, genders: [1], geo_locations: { countries: ['IN'] } });
      assert.ok(result.removed.includes('age_min'));
      assert.ok(result.removed.includes('genders'));
      assert.equal(result.clean.geo_locations.countries[0], 'IN');
    }
  },
  {
    name: 'realtor compliance defaults country to IN',
    fn: () => {
      const result = compliance.sanitizeTargetingForHousing(undefined);
      assert.deepEqual(result.clean.geo_locations, { countries: ['IN'] });
    }
  },
  {
    name: 'realtor compliance housing category payload',
    fn: () => {
      const payload = compliance.housingCategoryPayload();
      assert.ok(payload.special_ad_categories.includes('HOUSING'));
      assert.ok(payload.special_ad_category_country.includes('IN'));
    }
  },
  {
    name: 'realtor inr to minor units',
    fn: () => {
      assert.equal(campaign.inrToMinorUnits(500), 50000);
    }
  },
  {
    name: 'realtor normalize ad account id',
    fn: () => {
      assert.equal(campaign.normalizeAdAccountId('12345'), 'act_12345');
      assert.equal(campaign.normalizeAdAccountId('act_12345'), 'act_12345');
    }
  },
  {
    name: 'realtor campaign payload is housing special category',
    fn: () => {
      const context = { pageId: '123', adAccountId: 'act_1' };
      const payload = campaign.buildCampaignPayload(context, { destination: 'whatsapp' });
      assert.equal(payload.objective, 'OUTCOME_LEADS');
      assert.deepEqual(payload.special_ad_categories, ['HOUSING']);
      assert.equal(payload.status, 'PAUSED');
    }
  },
  {
    name: 'realtor adsets whatsapp sets whatsapp number',
    fn: () => {
      const context = { pageId: '123', adAccountId: 'act_1', whatsappNumber: '+919876543210' };
      const payload = campaign.buildAdSetPayload(context, { destination: 'whatsapp' }, 'c1');
      assert.equal(payload.destination_type, 'WHATSAPP');
      assert.equal(payload.optimization_goal, 'CONVERSATIONS');
      assert.ok(payload.promoted_object.includes('whatsapp_phone_number'));
    }
  },
  {
    name: 'realtor adset sets advantage_audience explicitly for v26 special ad categories',
    fn: () => {
      const context = { pageId: '123', adAccountId: 'act_1' };
      const payload = campaign.buildAdSetPayload(context, {}, 'c1');
      assert.deepEqual(payload.targeting_automation, { advantage_audience: 0 });
      const optIn = campaign.buildAdSetPayload(context, { advantageAudience: 1 }, 'c1');
      assert.deepEqual(optIn.targeting_automation, { advantage_audience: 1 });
    }
  },
  {
    name: 'realtor report summarizes rows',
    fn: () => {
      const rows = report._private.summarizeInsightRow({ spend: '100', impressions: '1000', clicks: '50', reach: '800', actions: [{ action_type: 'lead', value: '4' }] });
      assert.equal(rows.spend, 100);
      assert.equal(rows.impressions, 1000);
      assert.equal(rows.clicks, 50);
      assert.equal(rows.leads, 4);
      assert.ok(Math.abs(rows.ctr - 5) < 0.001);
    }
  },
  {
    name: 'realtor report aggregates totals',
    fn: () => {
      const totals = report._private.aggregateTotals([
        { spend: 50, impressions: 500, clicks: 10, reach: 400, leads: 2, whatsappConversations: 1 },
        { spend: 50, impressions: 500, clicks: 10, reach: 400, leads: 2, whatsappConversations: 1 }
      ]);
      assert.equal(totals.spend, 100);
      assert.equal(totals.leads, 4);
      assert.ok(Math.abs(totals.cpl - 25) < 0.001);
    }
  },
  {
    name: 'realtor buildAllPayloads works without network',
    fn: () => {
      const context = { pageId: '123', adAccountId: 'act_1', whatsappNumber: '+919876543210', city: 'Bengaluru' };
      const payloads = campaign.buildAllPayloads(context, { destination: 'whatsapp', dailyBudgetInr: 500 });
      assert.ok(payloads.campaign);
      assert.ok(payloads.adSet);
      assert.ok(payloads.creative);
      assert.ok(payloads.ad);
      assert.ok(Array.isArray(payloads.notes));
    }
  },
  {
    name: 'realtor adset advantage plus leads sets advantage states',
    fn: () => {
      const context = { pageId: '123', adAccountId: 'act_1' };
      const payload = campaign.buildAdSetPayload(context, { advantagePlusLeads: true }, 'c1');
      assert.equal(payload.advantage_state, 'ADVANTAGE_PLUS_LEADS');
      assert.equal(payload.advantage_budget_state, 'ENABLED');
      assert.equal(payload.advantage_audience_state, 'ENABLED');
      assert.equal(payload.advantage_placement_state, 'ENABLED');
      assert.equal(payload.bid_strategy, undefined);
      const off = campaign.buildAdSetPayload(context, {}, 'c1');
      assert.equal(off.advantage_state, undefined);
      assert.ok(off.bid_strategy);
    }
  },
  {
    name: 'realtor lead form payload builds questions and privacy policy',
    fn: () => {
      const payload = leadforms.buildLeadFormPayload('Enquiries', {
        privacyPolicyUrl: 'https://site.in/privacy',
        optimizedForQuality: true,
        followUpActionUrl: 'https://site.in/thank-you'
      });
      assert.equal(payload.name, 'Enquiries');
      assert.deepEqual(payload.privacy_policy, { url: 'https://site.in/privacy' });
      assert.equal(payload.context_type, 'PAGE');
      assert.equal(payload.is_optimized_for_quality, true);
      assert.equal(payload.follow_up_action_url, 'https://site.in/thank-you');
      assert.ok(Array.isArray(payload.questions));
      assert.equal(payload.questions.length, 3);
    }
  },
  {
    name: 'realtor capi hashes user data fields',
    fn: () => {
      const userData = capi.buildUserData({ email: 'Buyer@Example.com', phone: '+91 98765 43210' });
      assert.ok(Array.isArray(userData.em));
      assert.equal(userData.em[0], capi.sha256Hex('buyer@example.com'));
      assert.ok(Array.isArray(userData.ph));
      assert.equal(userData.ph[0], capi.sha256Hex('+91 98765 43210'));
      assert.equal(userData.fn, undefined);
    }
  },
  {
    name: 'realtor capi builds lead event payload',
    fn: () => {
      const event = capi.buildLeadEvent({
        eventName: 'Lead',
        eventId: 'evt-1',
        eventTime: 1700000000,
        eventSourceUrl: 'https://site.in/thank-you',
        actionSource: 'website',
        userData: { email: 'a@b.com' },
        customData: { project: 'Sarjapur' }
      });
      assert.equal(event.event_name, 'Lead');
      assert.equal(event.event_id, 'evt-1');
      assert.equal(event.event_time, 1700000000);
      assert.equal(event.event_source_url, 'https://site.in/thank-you');
      assert.equal(event.action_source, 'website');
      assert.deepEqual(event.custom_data, { project: 'Sarjapur' });
      assert.ok(event.user_data.em);
    }
  }
];
