class StorageProvider {
  async upload(file, options) {
    throw new Error('Method not implemented');
  }

  async delete(publicId) {
    throw new Error('Method not implemented');
  }

  getFileUrl(publicId) {
    throw new Error('Method not implemented');
  }

  async getUploadUrl(key, contentType) {
    throw new Error('Method not implemented');
  }

  getName() {
    throw new Error('Method not implemented');
  }
}

module.exports = StorageProvider;
