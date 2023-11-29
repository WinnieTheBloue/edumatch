import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

// Schéma de l'utilisateur
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
  },
  token: {
    type: String
  },
  name: {
    type: String,
    trim: true,
  },
  birthdate: {
    type: Date
  },
  bio: {
    type: String,
    trim: true
  },
  location: {
    type: {
      type: String,
      enum: ['Point']
    },
    coordinates: {
      type: [Number],
      validate: {
        validator: validateGeoJsonCoordinates,
        message: '{VALUE} is not a valid longitude/latitude(/altitude) coordinates array'
      }
    }
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  interests: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Interest'
  }],
  images: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Image'
  }],
  isAdmin: {
    type: Boolean,
    default: false
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  delete user.token;
  return user;
};

userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.generateAuthToken = async function () {
  const user = this;
  const token = jwt.sign({ _id: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });
  user.token = token;
  await user.save();
  return token;
};

userSchema.methods.addInterest = async function (interestId) {
  if (this.interests.includes(interestId)) {
    throw new Error('Interest already added.');
  }
  if (this.interests.length >= 5) {
    throw new Error('You can only add up to 5 interests.');
  }
  this.interests.push(interestId);
  await this.save();
};

// Méthode pour supprimer un intérêt de l'utilisateur
userSchema.methods.removeInterest = async function (interestId) {
  this.interests = this.interests.filter(id => id.toString() !== interestId.toString());
  await this.save();
};

// Créer un index géospatial sur le champ location
userSchema.index({ location: '2dsphere' });

// Validation d'un tableau de coordonnées GeoJSON (longitude, latitude et altitude facultative).
function validateGeoJsonCoordinates(value) {
  return Array.isArray(value) && value.length >= 2 && value.length <= 3 && isLongitude(value[0]) && isLatitude(value[1]);
}

function isLatitude(value) {
  return value >= -90 && value <= 90;
}

function isLongitude(value) {
  return value >= -180 && value <= 180;
}

userSchema.statics.findByAgeRange = async function (minAge, maxAge) {
  const currentDate = new Date();
  const minBirthdate = new Date(currentDate.getFullYear() - maxAge - 1, currentDate.getMonth(), currentDate.getDate());
  const maxBirthdate = new Date(currentDate.getFullYear() - minAge, currentDate.getMonth(), currentDate.getDate());

  return this.find({
    birthdate: {
      $gte: minBirthdate,
      $lte: maxBirthdate,
    },
  });
};

userSchema.statics.findByDistance = async function (currentLocation, maxDistance) {
  return this.aggregate([
    {
      $geoNear: {
        near: {
          type: "Point",
          coordinates: currentLocation,
        },
        distanceField: "distance",
        maxDistance: maxDistance * 1000, // Convertir la distance en mètres
        spherical: true,
      },
    },
    {
      $project: {
        _id: 1,
        email: 1,
        name: 1,
        birthdate: 1,
        distance: 1,
      },
    },
  ]);
};


// Créer le modèle en utilisant le schéma
const User = mongoose.model('User', userSchema);

export default User;