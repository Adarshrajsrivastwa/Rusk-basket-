const mongoose = require('mongoose');

const SuggestionSchema = new mongoose.Schema({
  text: {
    type: String,
    required: [true, 'Suggestion text is required'],
    trim: true,
    maxlength: [5000, 'Suggestion text cannot be more than 5000 characters'],
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: false,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

SuggestionSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

SuggestionSchema.index({ createdAt: -1 });
SuggestionSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Suggestion', SuggestionSchema);
