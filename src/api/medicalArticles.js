import { localClient } from './localClient';

export class MedicalArticle {
  constructor(data) {
    Object.assign(this, data);
  }

  static async setKeyStudy(articleId, isKey) {
    try {
      const data = await localClient.setMedicalArticleKey(articleId, isKey);
      return data;
    } catch (error) {
      console.error('Error setting key study flag:', error);
      throw error;
    }
  }

  static async setHiddenFromDashboard(articleId, isHidden) {
    try {
      const data = await localClient.setMedicalArticleHiddenFromDashboard(articleId, isHidden);
      return data;
    } catch (error) {
      console.error('Error setting hidden from dashboard flag:', error);
      throw error;
    }
  }

  static async getRelevantArticles(params = {}) {
    try {
      const response = await localClient.getRelevantArticles(params);
      return response.results.map(article => new MedicalArticle(article));
    } catch (error) {
      console.error('Error fetching relevant articles:', error);
      throw error;
    }
  }

  static async getRelevantArticlesStats() {
    try {
      return await localClient.getRelevantArticlesStats();
    } catch (error) {
      console.error('Error fetching relevant articles stats:', error);
      throw error;
    }
  }

  static async getById(articleId) {
    try {
      const data = await localClient.getMedicalArticle(articleId);
      return new MedicalArticle(data);
    } catch (error) {
      console.error('Error fetching medical article:', error);
      throw error;
    }
  }

  static async addSingle(url) {
    try {
        const response = await localClient.addSingleArticle(url);
        return new MedicalArticle(response.article);
    } catch (error) {
        console.error('Error adding single article:', error);
        throw error;
    }
  }

  static async search(query, params = {}) {
    try {
      const response = await localClient.searchMedicalArticles(query, params);
      return response.results.map(article => new MedicalArticle(article));
    } catch (error) {
      console.error('Error searching medical articles:', error);
      throw error;
    }
  }

  // Helper method to get formatted publication date
  getFormattedPublicationDate() {
    if (!this.publication_date) return null;
    try {
      return new Date(this.publication_date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      return this.publication_date;
    }
  }

  // Helper method to get truncated abstract
  getTruncatedAbstract(maxLength = 200) {
    if (!this.abstract) return null;
    if (this.abstract.length <= maxLength) return this.abstract;
    return this.abstract.substring(0, maxLength) + '...';
  }

  // Helper method to get author list (first few authors)
  getAuthorList(maxAuthors = 3) {
    if (!this.authors) return null;
    const authors = this.authors.split(';').map(author => author.trim());
    if (authors.length <= maxAuthors) {
      return authors.join(', ');
    }
    return authors.slice(0, maxAuthors).join(', ') + ' et al.';
  }

  // Helper method to determine if this is a major journal based on ranking score
  isMajorJournal() {
    return this.ranking_score >= 8; // Adjust threshold as needed
  }

  // Helper method to get specialty from medical category
  getSpecialty() {
    if (!this.medical_category) return null;
    return this.medical_category.replace(/_/g, ' ');
  }
}
